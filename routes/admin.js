const express = require('express');
const router = express.Router();
const db = require('../database');
const path = require('path');
const fs = require('fs');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const upload = multer({ dest: 'temp_uploads/' });
const { updateEnvValue } = require('../utils/envSync');
const { sendEmail, getTransporter } = require('../utils/email');
const { sendSMS } = require('../utils/sms');
const templates = require('../utils/emailTemplates');
const speakeasy = require('speakeasy');
const cookieParser = require('cookie-parser');
const QRCode = require('qrcode');
const { runBillingChecks } = require('../utils/billing');
const logger = require('../utils/logger');
/**
 * 📝 AUDIT LOG HELPER: Standardized system-wide logging
 */
function logActivity(category, action, details = {}, adminName = 'System', clientId = null) {
  try {
    db.prepare(`
      INSERT INTO activity_log (category, action, details, admin_name, client_id)
      VALUES (?, ?, ?, ?, ?)
    `).run(category, action, typeof details === 'object' ? JSON.stringify(details) : details, adminName, clientId);
  } catch (err) {
    console.error('[AUDIT-LOG-ERROR]', err.message);
  }
}

// 🛡️ MIKROTIK LIVE API
const mikrotik = require('../utils/mikrotik');

/**
 * 📊 API: Fetch Activity Logs
 */
router.get('/activity-logs', (req, res) => {
  try {
    const { category, search, dateFilter } = req.query;
    let query = 'SELECT * FROM activity_log';
    const params = [];
    const conditions = [];

    if (category) {
      conditions.push(' category = ?');
      params.push(category);
    }
    if (search) {
      conditions.push(' (action LIKE ? OR details LIKE ? OR admin_name LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    // --- Advanced Date Filtering ---
    if (dateFilter) {
      if (dateFilter === 'today') {
        conditions.push(" date(timestamp) = date('now')");
      } else if (dateFilter === 'yesterday') {
        conditions.push(" date(timestamp) = date('now', '-1 day')");
      } else {
        // Assume dateFilter is a specific YYYY-MM-DD
        conditions.push(" date(timestamp) = ?");
        params.push(dateFilter);
      }
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY timestamp DESC LIMIT 1000';
    const logs = db.prepare(query).all(...params);
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 📅 API: Get all months from Jan of current year to current month (for the export dropdown)
 */
router.get('/payment-months', requireAdmin, (req, res) => {
  try {
    const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1; // 1-based

    // Build all 12 months for the selected/current year (most recent first)
    const result = [];
    for (let m = 12; m >= 1; m--) {
      result.push({
        year: currentYear,
        month: m,
        label: `${monthNames[m - 1]} ${currentYear}`
      });
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 📥 API: Export Monthly Payments as CSV
 */
router.get('/export-payments', requireAdmin, (req, res) => {
  try {
    const { month, year } = req.query;
    const now = new Date();
    const y = year ? parseInt(year) : now.getFullYear();
    const m = month ? parseInt(month) - 1 : now.getMonth();

    // Fetch all paid payments for valid clients
    const rows = db.prepare(`
      SELECT p.id, c.full_name as client_name, c.account_id, p.amount, p.paid_date, p.previous_due_date, p.payment_method, p.remarks
      FROM payments p
      INNER JOIN clients c ON p.client_id = c.id
      WHERE p.status = 'paid'
        AND c.full_name IS NOT NULL
      ORDER BY p.paid_date ASC
    `).all();

    // Filter payments in JS by their billing cycle month (previous_due_date)
    const filteredRows = rows.filter(r => {
      if (!r.previous_due_date) return false;
      
      let dateVal = r.previous_due_date;
      if (!dateVal.includes('T')) {
        // Support both MM/DD/YYYY and YYYY-MM-DD
        if (dateVal.includes('/')) {
          const parts = dateVal.split('/');
          if (parts[2] && parts[2].length === 4) {
            dateVal = `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
          }
        }
        dateVal = dateVal + 'T12:00:00';
      }
      
      const d = new Date(dateVal);
      if (isNaN(d.getTime())) return false;
      
      return d.getFullYear() === y && d.getMonth() === m;
    });

    const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const monthLabel = `${monthNames[m]} ${y}`;

    // Header rows for context
    let csv = `Payment Report - ${monthLabel}\n`;
    csv += `Generated: ${new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}\n`;
    csv += `Total Records: ${filteredRows.length}\n\n`;

    // Column headers
    csv += 'No.,Client Name,Account ID,Amount (PHP),Paid Date,Payment Method,Remarks\n';

    let totalAmount = 0;
    filteredRows.forEach((r, idx) => {
      const escape = (v) => {
        if (v == null) return '';
        let s = String(v);
        if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
        return s;
      };
      totalAmount += parseFloat(r.amount) || 0;
      csv += [idx + 1, r.client_name, r.account_id, r.amount, r.paid_date, r.payment_method, r.remarks].map(escape).join(',') + '\n';
    });

    // Summary footer — TOTAL COLLECTED aligns under Amount column (col D = index 3)
    csv += `\nTOTAL COLLECTED,,,${totalAmount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="payments_${y}_${(m+1).toString().padStart(2, '0')}.csv"`);
    res.send(csv);
  } catch (err) {
    res.status(500).send('Error generating CSV: ' + err.message);
  }
});

/**
 * 🧹 API: Clear Activity Logs
 */
router.post('/activity-logs/clear', requireAdmin, (req, res) => {
  try {
    db.prepare('DELETE FROM activity_log').run();
    logActivity('System', 'Audit Log Cleared', { date: new Date().toISOString() }, req.session.admin.username);
    res.json({ success: true, message: 'Activity logs cleared successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const discovery = {
  triggerDiscovery: () => console.log('Discovery disabled in manual mode.')
};

const { getSettings, parseDateStrict, calculateNextDue, addMonths, sanitizePassword } = require('../utils/shared');


function formatDateMDY(dateStr) {
  const d = parseDateStrict(dateStr);
  if (!d) return "-";
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

/**
 * 📅 HELPER: Format date for MikroTik Comments (e.g., DECEMBER 12, 2025)
 */
function formatDateForComment(dateStr) {
  if (!dateStr || dateStr === "") return "";
  
  // Standardize parsing (MM/DD/YYYY to ISO)
  let d;
  if (dateStr.includes('/')) {
    const [m, dPart, y] = dateStr.split('/');
    d = new Date(`${y}-${m.padStart(2, '0')}-${dPart.padStart(2, '0')}T12:00:00`);
  } else {
    d = new Date(dateStr.includes('T') ? dateStr : dateStr + 'T12:00:00');
  }

  if (isNaN(d.getTime())) return "";
  const months = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

// ─── Authentication Rate Limiter ───
const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100, // Increased for testing/owner ease
  message: { error: 'Too many login attempts. Access blocked for 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const OTP_STORE = {}; // In-memory OTP store { username: { otp, expires } }
const bcrypt = require('bcryptjs');

// ─── Pre-Automation Analysis (Dry Run) ───
router.get('/billing/analyze', (req, res) => {
  try {
    const clients = db.prepare('SELECT * FROM clients').all();
    const settings = db.prepare('SELECT * FROM settings LIMIT 1').get() || { grace_period: 3 };
    const gracePeriod = settings.grace_period || 3;
    const now = new Date();
    now.setHours(0,0,0,0);

    const results = {
      total: clients.length,
      standing: 0,
      reminders: [],
      suspensions: [],
      errors: 0
    };

    for (const c of clients) {
       if (!c.next_due_date) continue;
       try {
         const dDue = parseDateStrict(c.next_due_date);
         if (!dDue) continue;

         const diffTime = dDue.getTime() - now.getTime();
         const diffDays = Math.round(diffTime / (1000 * 3600 * 24));

         if (diffDays <= -gracePeriod) {
           if (c.status === 'active' || c.status === 'overdue') {
             results.suspensions.push({ name: c.full_name, days: Math.abs(diffDays) });
           } else {
             results.standing++;
           }
         } else if (diffDays <= 0) {
            results.reminders.push({ name: c.full_name, type: 'CRITICAL', days: diffDays });
         } else if (diffDays <= 5) {
            results.reminders.push({ name: c.full_name, type: 'WARNING', days: diffDays });
         } else {
           results.standing++;
         }
       } catch (e) { results.errors++; }
    }

    res.json({ success: true, ...results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Auth Middleware ───
function requireAdmin(req, res, next) {
  if (req.session && req.session.admin) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

// ─── Login ───
router.post('/login', adminLoginLimiter, (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM admin_users WHERE LOWER(username) = LOWER(?)').get(username);

  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  // 1. Check if 2FA is enabled
  if (user.two_factor_enabled) {
    // 2. Check for Trusted Device Cookie
    const trustedToken = req.cookies.trusted_device_id;
    if (trustedToken) {
      try {
        const devices = JSON.parse(user.trusted_devices || '[]');
        const isTrusted = devices.find(d => d.token === trustedToken && d.expiry > Date.now());
        
        if (isTrusted) {
          // Device is trusted, login immediately!
          req.session.admin = { id: user.id, username: user.username, fullName: user.full_name, email: user.email };
          return res.json({ success: true, user: req.session.admin, trusted: true });
        }
      } catch (e) { console.error('Trusted devices JSON error'); }
    }

    // 3. Not trusted, require Email OTP
    // Generate Random 6-Digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = Date.now() + 5 * 60 * 1000; // 5 minute expiry

    // Save to DB
    db.prepare('UPDATE admin_users SET two_factor_otp = ?, two_factor_otp_expiry = ? WHERE id = ?')
      .run(otp, expiry, user.id);

    // Send Email via Gmail
    const otpEmail = templates.twoFactorTemplate(user.full_name, otp);
    sendEmail(user.email, 'Login Security Code', otpEmail.text, otpEmail.html);

    // Store user ID in session temporarily
    req.session.pending2FAUserId = user.id;
    return res.json({ success: false, require2FA: true, fullName: user.full_name, emailMasked: maskEmail(user.email) });
  }

  // Legacy Login (2FA Disabled)
  req.session.admin = { id: user.id, username: user.username, fullName: user.full_name, email: user.email };
  res.json({ success: true, user: req.session.admin });
});

function maskEmail(email) {
  if (!email) return 'your registered email';
  const [user, domain] = email.split('@');
  return `${user.substring(0, 3)}***@${domain}`;
}

router.post('/2fa/verify-login', (req, res) => {
  const { code, trustDevice } = req.body;
  const userId = req.session.pending2FAUserId;

  if (!userId || !code) return res.status(400).json({ error: 'Session expired or missing code' });

  const user = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  // Verify Email OTP
  const isMatch = user.two_factor_otp === String(code);
  const isExpired = Date.now() > user.two_factor_otp_expiry;

  if (isMatch && !isExpired) {
    // Success - Clear OTP from DB
    db.prepare('UPDATE admin_users SET two_factor_otp = NULL, two_factor_otp_expiry = NULL WHERE id = ?').run(user.id);
    
    loginAdmin(req, user);

    if (trustDevice) {
      // 🛡️ Issue Trusted Device Token
      const token = db.generateToken(32);
      const expiry = Date.now() + (30 * 24 * 60 * 60 * 1000); // 30 Days
      
      const devices = JSON.parse(user.trusted_devices || '[]');
      devices.push({ token, expiry, added: new Date().toISOString() });
      
db.prepare('UPDATE admin_users SET trusted_devices = ? WHERE id = ?')
        .run(JSON.stringify(devices), user.id);

      res.cookie('trusted_device_id', token, {
        maxAge: 30 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production'
      });
    }

    res.json({ success: true, user: req.session.admin });
  } else {
    const errorMsg = isExpired ? 'Security code has expired. Please try logging in again.' : 'Invalid security code. Please check your Gmail.';
    res.status(400).json({ error: errorMsg });
  }
});

function loginAdmin(req, user) {
  req.session.admin = { id: user.id, username: user.username, fullName: user.full_name };
  delete req.session.pending2FAUserId;
}

router.post('/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

router.get('/session', (req, res) => {
  if (req.session && req.session.admin) {
    res.json({ loggedIn: true, user: req.session.admin });
  } else {
    res.json({ loggedIn: false });
  }
});

// ─── Two-Factor Authentication (2FA) ───
router.post('/2fa/setup', requireAdmin, async (req, res) => {
  try {
    const user = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(req.session.admin.id);
    if (!user.email) return res.status(400).json({ error: 'Please set a recovery email in your profile before enabling 2FA.' });

    // Generate Verification OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = Date.now() + 10 * 60 * 1000; // 10 minute expiry for setup

    // Save to DB
    db.prepare('UPDATE admin_users SET two_factor_otp = ?, two_factor_otp_expiry = ? WHERE id = ?')
      .run(otp, expiry, user.id);

    // Send Email
    const otpEmail = templates.twoFactorTemplate(user.full_name, otp);
    sendEmail(user.email, 'Security Activation Code', otpEmail.text, otpEmail.html);

    res.json({ success: true, message: 'Verification code sent to your Gmail.', emailMasked: maskEmail(user.email) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to initiate 2FA setup' });
  }
});

router.post('/2fa/verify-setup', requireAdmin, (req, res) => {
  const { code } = req.body;
  const userId = req.session.admin.id;

  if (!code) return res.status(400).json({ error: 'Missing verification code' });

  const user = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  // Verify OTP
  const isMatch = user.two_factor_otp === String(code);
  const isExpired = Date.now() > user.two_factor_otp_expiry;

  if (isMatch && !isExpired) {
    // 🛡️ Enable 2FA in DB
    db.prepare('UPDATE admin_users SET two_factor_enabled = 1, two_factor_otp = NULL, two_factor_otp_expiry = NULL WHERE id = ?')
      .run(userId);
    
    res.json({ success: true, message: '2FA Enabled successfully! Your account is now protected.' });
  } else {
    res.status(400).json({ error: isExpired ? 'Verification code expired. Please request a new one.' : 'Invalid verification code.' });
  }
});

router.post('/2fa/disable', requireAdmin, (req, res) => {
  db.prepare('UPDATE admin_users SET two_factor_secret = NULL, two_factor_enabled = 0 WHERE id = ?')
    .run(req.session.admin.id);
  res.json({ success: true, message: '2FA Disabled successfully.' });
});

router.post('/2fa/revoke-device', requireAdmin, (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Token is required' });

  const user = db.prepare('SELECT trusted_devices FROM admin_users WHERE id = ?')
    .get(req.session.admin.id);

  if (!user) return res.status(404).json({ error: 'User not found' });

  let devices = JSON.parse(user.trusted_devices || '[]');
  const initialLength = devices.length;
  devices = devices.filter(d => d.token !== token);

  if (devices.length === initialLength) {
    return res.status(404).json({ error: 'Device token not found' });
  }

  db.prepare('UPDATE admin_users SET trusted_devices = ? WHERE id = ?')
    .run(JSON.stringify(devices), req.session.admin.id);

  res.json({ success: true, message: 'Device revoked successfully.' });
});

router.get('/2fa/status', requireAdmin, (req, res) => {
  const user = db.prepare('SELECT two_factor_enabled, trusted_devices FROM admin_users WHERE id = ?')
    .get(req.session.admin.id);
  
  if (user) {
    res.json({ 
      enabled: !!user.two_factor_enabled, 
      trustedDevices: JSON.parse(user.trusted_devices || '[]')
    });
  } else {
    res.status(404).json({ error: 'User not found' });
  }
});

// ─── Admin Profile & Settings ───
router.get('/profile', requireAdmin, (req, res) => {
  const user = db.prepare('SELECT * FROM admin_users WHERE username = ?').get(req.session.admin.username);
  if (user) {
    res.json({ success: true, profile: { username: user.username, full_name: user.full_name, email: user.email } });
  } else {
    res.status(404).json({ error: 'User not found' });
  }
});

router.put('/profile', requireAdmin, (req, res) => {
  const { full_name, email } = req.body;
  try {
    db.prepare('UPDATE admin_users SET full_name = ?, email = ? WHERE username = ?').run(full_name, email, req.session.admin.username);
    req.session.admin.fullName = full_name; // Update current session immediately
    res.json({ success: true });
  } catch(e) {
    res.status(500).json({ error: 'Update failed' });
  }
});

// ─── Password OTP Flow ───
router.post('/change-password/request-otp', requireAdmin, async (req, res) => {
  const { current_password } = req.body;
  const username = req.session.admin.username;
  const user = db.prepare('SELECT * FROM admin_users WHERE username = ?').get(username);
  
  if (!user || !bcrypt.compareSync(current_password, user.password)) {
    return res.status(401).json({ error: 'Incorrect current password' });
  }
  
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  OTP_STORE[username] = { otp, expires: Date.now() + 5 * 60 * 1000 }; // 5 mins
  
  if (user.email) {
    const resMail = await sendEmail(user.email, 'Admin Password Change OTP', 
      `Your OTP to change the admin password is: ${otp}\n\nIt will expire in 5 minutes.`);
    if (resMail.mocked) {
      console.log(`[DEBUG] OTP for ${username} is ${otp}`);
      return res.json({ success: true, devMode: true });
    }
  } else {
    return res.status(400).json({ error: 'No email registered for this admin.' });
  }
  
  res.json({ success: true, message: 'OTP sent' });
});

router.post('/change-password/verify', requireAdmin, (req, res) => {
  const { otp, new_password } = req.body;
  const username = req.session.admin.username;
  const record = OTP_STORE[username];
  
  if (!record || record.otp !== otp || Date.now() > record.expires) {
    return res.status(400).json({ error: 'Invalid or expired OTP' });
  }
  
  const hashedPassword = bcrypt.hashSync(new_password, 10);
  db.prepare('UPDATE admin_users SET password = ? WHERE username = ?').run(hashedPassword, username);
  delete OTP_STORE[username]; // invalidate
  
  res.json({ success: true });
});

// ─── Email OTP Flow ───
router.post('/change-email/request-current', requireAdmin, async (req, res) => {
  try {
    const { current_email } = req.body;
    const username = req.session.admin.username;
    console.log(`[AUTH] Change Email Request from ${username} for ${current_email}`);
    
    const user = db.prepare('SELECT * FROM admin_users WHERE username = ?').get(username);
    
    if (!user) {
      return res.status(404).json({ error: 'Admin user not found in database.' });
    }

    if (user.email !== current_email) {
      console.warn(`[AUTH] Email mismatch: Database has ${user.email}, user entered ${current_email}`);
      return res.status(400).json({ error: 'Incorrect current email. Please enter the email registered to this account.' });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    OTP_STORE[username + '_curr'] = { otp, expires: Date.now() + 5 * 60 * 1000 };
    
    if (process.env.SMTP_USER && process.env.SMTP_PASS) {
      try {
        await getTransporter().sendMail({
          from: `"ISP System" <${process.env.SMTP_USER}>`,
          to: user.email,
          subject: 'Admin Email Change OTP',
          text: `Your OTP to authorize changing your admin email is: ${otp}\n\nIt will expire in 5 minutes.`
        });
        console.log(`[AUTH] Current Email OTP sent to ${user.email}`);
      } catch(err) {
        console.error(`[AUTH] SMTP Error: ${err.message}`);
        console.log(`[DEBUG] OTP for ${username} is ${otp}`);
        return res.json({ success: true, devMode: true, warning: 'SMTP failed, check terminal for OTP' });
      }
    } else {
      console.log(`[WARNING] DEV MODE. Current Email OTP for ${username} is ${otp}`);
      return res.json({ success: true, devMode: true });
    }
    res.json({ success: true, message: 'OTP sent' });
  } catch (err) {
    console.error(`[AUTH] System Error: ${err.message}`);
    res.status(500).json({ error: 'Internal server error: ' + err.message });
  }
});

router.post('/change-email/verify-current', requireAdmin, (req, res) => {
  try {
    const { otp } = req.body;
    const username = req.session.admin.username;
    const record = OTP_STORE[username + '_curr'];
    
    if (!record || record.otp !== otp || Date.now() > record.expires) {
      return res.status(400).json({ error: 'Invalid or expired OTP' });
    }
    
    req.session.admin.canChangeEmail = true;
    delete OTP_STORE[username + '_curr'];
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'System error: ' + err.message });
  }
});

router.post('/change-email/request-new', requireAdmin, async (req, res) => {
  try {
    if (!req.session.admin.canChangeEmail) return res.status(403).json({ error: 'Authorization required. Please verify your current email first.' });
    
    const { new_email } = req.body;
    const username = req.session.admin.username;
    if (!new_email) return res.status(400).json({ error: 'New email required.' });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    OTP_STORE[username + '_new'] = { otp, new_email, expires: Date.now() + 5 * 60 * 1000 };
    
    if (process.env.SMTP_USER && process.env.SMTP_PASS) {
      try {
        await getTransporter().sendMail({
          from: `"ISP System" <${process.env.SMTP_USER}>`,
          to: new_email,
          subject: 'Verify New Admin Email',
          text: `Your OTP to confirm this new admin email is: ${otp}\n\nIt will expire in 5 minutes.`
        });
        console.log(`[AUTH] New Email OTP sent to ${new_email}`);
      } catch(err) {
        console.error(`[AUTH] SMTP Error on New Email: ${err.message}`);
        console.log(`[DEBUG] OTP for ${new_email} is ${otp}`);
        return res.json({ success: true, devMode: true, warning: 'SMTP failed, check terminal for OTP' });
      }
    } else {
      console.log(`[WARNING] DEV MODE. New Email OTP for ${new_email} is ${otp}`);
      return res.json({ success: true, devMode: true });
    }
    res.json({ success: true, message: 'OTP sent' });
  } catch (err) {
    res.status(500).json({ error: 'System error: ' + err.message });
  }
});

router.post('/change-email/verify-new', requireAdmin, (req, res) => {
  try {
    if (!req.session.admin.canChangeEmail) return res.status(403).json({ error: 'Authorization required.' });
    
    const { otp } = req.body;
    const username = req.session.admin.username;
    const record = OTP_STORE[username + '_new'];
    
    if (!record || record.otp !== otp || Date.now() > record.expires) {
      return res.status(400).json({ error: 'Invalid or expired OTP' });
    }
    
    db.prepare('UPDATE admin_users SET email = ? WHERE username = ?').run(record.new_email, username);
    console.log(`[AUTH] Admin ${username} changed email to ${record.new_email}`);
    
    req.session.admin.canChangeEmail = false;
    delete OTP_STORE[username + '_new'];
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'System error: ' + err.message });
  }
});

// ─── Forgot Password Flow ───
router.post('/forgot-password/request-otp', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const user = db.prepare('SELECT * FROM admin_users WHERE email = ?').get(email);
    if (!user) {
      return res.status(404).json({ error: 'Email Not found!' });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const key = `forgot_${email}`;
    OTP_STORE[key] = { otp, username: user.username, expires: Date.now() + 10 * 60 * 1000 }; // 10 mins

    if (process.env.SMTP_USER && process.env.SMTP_PASS) {
      try {
        await getTransporter().sendMail({
          from: `"ISP System" <${process.env.SMTP_USER}>`,
          to: email,
          subject: 'Admin Password Reset OTP',
          text: `Your OTP for password reset is: ${otp}\n\nThis will expire in 10 minutes.`
        });
        console.log(`[AUTH] Forgot Password OTP sent to ${email}`);
      } catch (err) {
        console.error(`[AUTH] SMTP Error: ${err.message}`);
        return res.json({ success: true, devMode: true, warning: 'SMTP failed, check terminal for OTP' });
      }
    } else {
      console.log(`[WARNING] DEV MODE. Forgot Password OTP for ${email} is ${otp}`);
      return res.json({ success: true, devMode: true });
    }
    res.json({ success: true, message: 'OTP sent to your email' });
  } catch (err) {
    res.status(500).json({ error: 'System error: ' + err.message });
  }
});

router.post('/forgot-password/verify-otp', (req, res) => {
  try {
    const { email, otp } = req.body;
    const key = `forgot_${email}`;
    const record = OTP_STORE[key];

    if (!record || record.otp !== otp || Date.now() > record.expires) {
      return res.status(400).json({ error: 'Invalid or expired OTP' });
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'System error: ' + err.message });
  }
});

router.post('/forgot-password/reset', (req, res) => {
  try {
    const { email, otp, new_password } = req.body;
    const key = `forgot_${email}`;
    const record = OTP_STORE[key];

    if (!record || record.otp !== otp || Date.now() > record.expires) {
      return res.status(400).json({ error: 'Session expired. Please request a new OTP.' });
    }

    const hashedPassword = bcrypt.hashSync(new_password, 10);
    db.prepare('UPDATE admin_users SET password = ? WHERE username = ?').run(hashedPassword, record.username);
    delete OTP_STORE[key];

    res.json({ success: true, message: 'Password reset successful' });
  } catch (err) {
    res.status(500).json({ error: 'System error: ' + err.message });
  }
});

// ─── Dashboard Stats (Restored with Live MikroTik Monitoring & Error-Tolerance) ───
router.get('/dashboard', requireAdmin, async (req, res) => {
  try {
    const clients = db.prepare('SELECT * FROM clients').all();
    const totalClients = clients.length;
    
    const totalRevenue = db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE status = 'paid'").get().total;
    const pendingApps = db.prepare("SELECT COUNT(*) as count FROM applications WHERE status = 'pending'").get().count;
    const openTickets = db.prepare("SELECT COUNT(*) as count FROM support_tickets WHERE status = 'open'").get().count;
    const pendingProofsCount = db.prepare("SELECT COUNT(*) as count FROM payment_proofs WHERE status = 'pending_verification'").get().count;

    const settings = db.prepare('SELECT disable_mikrotik FROM settings WHERE id = 1').get() || {};
    const mikrotikDisabled = settings.disable_mikrotik === 1;

    // Get new installation dues (pending status)
    const newInstallDueCount = db.prepare("SELECT COUNT(*) as count FROM installations WHERE status = 'pending'").get().count;

    // Count reminders sent today from reminders_log
    const remindersSentToday = db.prepare("SELECT COUNT(*) as count FROM reminders_log WHERE DATE(sent_at) = DATE('now', 'localtime')").get().count;

    let active = [];
    let secrets = [];
    let identity = 'Offline';
    let connected = false;

    try {
      // Fetch data from MikroTik with 8-second internal memory caching
      identity = await mikrotik.getSystemIdentity();
      active = await mikrotik.getActivePPPoE();
      secrets = await mikrotik.getPPPoESecrets();
      connected = mikrotik.connected;
    } catch (e) {
      console.warn('📡 [DASHBOARD] Router unreachable or integration disabled. Serving local stats.');
    }

    const secretMap = new Map(secrets.map(s => [s.name.toLowerCase().trim(), s]));
    const activeMap = new Map(active.map(a => [a.name.toLowerCase().trim(), a]));

    // Fetch accumulated bandwidth usage from database
    const dbUsageRecords = db.prepare('SELECT pppoe_user, monthly_usage FROM bandwidth_usage').all();
    const usageMap = new Map(dbUsageRecords.map(r => [r.pppoe_user.toLowerCase().trim(), r.monthly_usage]));

    let activeClients = 0;
    let offlineClients = 0;
    let disabledClients = 0;
    let unpaidCount = 0;

    const onlineClientsList = [];
    const offlineClientsList = [];
    const disabledClientsList = [];
    const unpaidList = [];
    
    // Status board accounts list for PPPoE status board table
    const accountStatusList = [];

    // Combine database clients with MikroTik state
    clients.forEach(c => {
      const username = (c.pppoe_user || '').toLowerCase().trim();
      if (!username) return;

      const secret = secretMap.get(username);
      const session = activeMap.get(username);
      const monthlyBytes = usageMap.get(username) || 0;

      let status = 'OFFLINE';
      let uptime = '-';
      let usage = monthlyBytes > 0 ? mikrotik.formatBytes(monthlyBytes) : '0 B';
      let ip = c.ip_address || '-';
      let mtu = '-';

      if (secret) {
        // Unpaid profile count
        if (String(secret.profile || '').toLowerCase() === 'unpaid') {
          unpaidCount++;
          unpaidList.push({
            full_name: c.full_name,
            account_id: c.account_id || c.id,
            msg: 'Unpaid Plan Profile'
          });
        }

        if (secret.disabled) {
          status = 'DISABLED';
          disabledClients++;
          disabledClientsList.push({
            full_name: c.full_name,
            account_id: c.account_id || c.id,
            msg: 'Disabled Secret' + (secret.comment ? ' (' + secret.comment + ')' : '')
          });
        } else if (session) {
          status = 'ACTIVE';
          activeClients++;
          uptime = session.uptime || '-';
          usage = session.usage || usage;
          ip = session.address || c.ip_address || '-';
          mtu = session.mtu || '-';
          onlineClientsList.push({
            full_name: c.full_name,
            account_id: c.account_id || c.id,
            msg: `IP: ${ip} | Uptime: ${uptime} | Usage: ${usage}`
          });
        } else {
          status = 'OFFLINE';
          offlineClients++;
          offlineClientsList.push({
            full_name: c.full_name,
            account_id: c.account_id || c.id,
            msg: 'Offline Secret' + (secret.comment ? ' (' + secret.comment + ')' : '')
          });
        }
      } else {
        // Client exists in DB but not on MikroTik
        offlineClients++;
        offlineClientsList.push({
          full_name: c.full_name,
          account_id: c.account_id || c.id,
          msg: 'Not Found on Router'
        });
      }

      accountStatusList.push({
        name: c.pppoe_user,
        fullName: c.full_name,
        address: ip,
        status: status,
        usage: usage,
        uptime: uptime,
        mtu: mtu
      });
    });

    // Also include any active sessions or secrets that are on the router but not in the database!
    secrets.forEach(s => {
      const name = s.name.toLowerCase().trim();
      const inDb = clients.some(c => (c.pppoe_user || '').toLowerCase().trim() === name);
      if (!inDb) {
        const session = activeMap.get(name);
        const monthlyBytes = usageMap.get(name) || 0;
        let status = 'OFFLINE';
        let uptime = '-';
        let usage = monthlyBytes > 0 ? mikrotik.formatBytes(monthlyBytes) : '0 B';
        let ip = s.remoteAddress || '-';
        let mtu = '-';

        if (s.disabled) {
          status = 'DISABLED';
          disabledClients++;
          disabledClientsList.push({
            full_name: s.name + ' (Router Only)',
            account_id: 'ROUTER',
            msg: 'Disabled Secret'
          });
        } else if (session) {
          status = 'ACTIVE';
          activeClients++;
          uptime = session.uptime || '-';
          usage = session.usage || usage;
          ip = session.address || '-';
          mtu = session.mtu || '-';
          onlineClientsList.push({
            full_name: s.name + ' (Router Only)',
            account_id: 'ROUTER',
            msg: `IP: ${ip} | Uptime: ${uptime} | Usage: ${usage}`
          });
        } else {
          status = 'OFFLINE';
          offlineClients++;
          offlineClientsList.push({
            full_name: s.name + ' (Router Only)',
            account_id: 'ROUTER',
            msg: 'Offline Secret'
          });
        }

        accountStatusList.push({
          name: s.name,
          fullName: 'Router-Only Account (Not in DB)',
          address: ip,
          status: status,
          usage: usage,
          uptime: uptime,
          mtu: mtu
        });
      }
    });

    // Sort accountStatusList: ACTIVE first, then OFFLINE, then DISABLED
    accountStatusList.sort((a, b) => {
      const order = { 'ACTIVE': 1, 'OFFLINE': 2, 'DISABLED': 3 };
      const orderA = order[a.status] || 99;
      const orderB = order[b.status] || 99;
      return orderA - orderB;
    });

    // Top 5 data consumers (talkers) sorted by accumulated monthly data usage bytes
    const talkers = [];
    clients.forEach(c => {
      const username = (c.pppoe_user || '').toLowerCase().trim();
      if (!username) return;
      const bytes = usageMap.get(username) || 0;
      const session = activeMap.get(username);
      talkers.push({
        name: c.full_name,
        address: session ? session.address : (c.ip_address || '-'),
        uptime: session ? session.uptime : 'Offline',
        mtu: session ? session.mtu : '-',
        usage: mikrotik.formatBytes(bytes),
        bytes: bytes
      });
    });

    secrets.forEach(s => {
      const name = s.name.toLowerCase().trim();
      const inDb = clients.some(c => (c.pppoe_user || '').toLowerCase().trim() === name);
      if (!inDb) {
        const bytes = usageMap.get(name) || 0;
        const session = activeMap.get(name);
        talkers.push({
          name: s.name + ' (Router Only)',
          address: session ? session.address : (s.remoteAddress || '-'),
          uptime: session ? session.uptime : 'Offline',
          mtu: session ? session.mtu : '-',
          usage: mikrotik.formatBytes(bytes),
          bytes: bytes
        });
      }
    });

    const topTalkers = talkers
      .sort((a, b) => b.bytes - a.bytes)
      .slice(0, 5);

    res.json({
      routerInfo: {
        host: mikrotik.host,
        identity: identity,
        connected: connected
      },
      stats: {
        totalClients,
        activeClients,
        offlineClients,
        disabledClients,
        totalRevenue,
        pendingApps,
        openTickets,
        pendingProofsCount,
        newInstallDueCount,
        remindersSentToday,
        unpaidCount
      },
      mikrotikDisabled,
      accountStatusList,
      topTalkers,
      onlineClients: onlineClientsList,
      offlineClients: offlineClientsList,
      disabledClients: disabledClientsList,
      unpaidList
    });
  } catch (err) {
    console.error('📊 Dashboard Stats Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Clients (PPPoE Monitoring with Real-time Status) ───
router.get('/clients', requireAdmin, async (req, res) => {
  try {
    const clients = db.prepare(`
      SELECT c.*, p.price as plan_price
      FROM clients c
      LEFT JOIN plans p ON LOWER(c.plan) = LOWER(p.name) OR LOWER(c.plan) = LOWER(p.id)
      ORDER BY c.full_name ASC
    `).all();
    
    // 🚀 BATCH OPTIMIZATION: One query for all clients
    const paymentStats = db.prepare(`
      SELECT client_id, 
             COUNT(*) as p_count, 
             SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END) as total_paid
      FROM payments 
      GROUP BY client_id
    `).all();
    const statsMap = new Map(paymentStats.map(s => [s.client_id, s]));
    
    // Fetch accumulated bandwidth usage from database
    const dbUsageRecords = db.prepare('SELECT pppoe_user, monthly_usage FROM bandwidth_usage').all();
    const usageMap = new Map(dbUsageRecords.map(r => [r.pppoe_user.toLowerCase().trim(), r.monthly_usage]));

    const result = clients.map(c => {
      const stats = statsMap.get(c.id) || { p_count: 0, total_paid: 0 };
      const username = (c.pppoe_user || '').toLowerCase().trim();
      const monthlyBytes = usageMap.get(username) || 0;

      return {
        ...c,
        monthly_rate: c.plan_price || c.monthly_rate || 0,
        is_online: false,
        uptime: null,
        usage: monthlyBytes > 0 ? mikrotik.formatBytes(monthlyBytes) : '0 B',
        ip_address: c.ip_address || '-',
        caller_id: c.mac_address || '-',
        payment_count: stats.p_count,
        total_paid: stats.total_paid
      };
    });

    res.json(result);
  } catch (err) {
    console.error('❌ GET /clients Error:', err.message);
    res.status(500).json({ error: 'Failed to load clients' });
  }
});

// ─── Sync Clients from MikroTik (Import) ───
router.post('/clients/sync-mikrotik', requireAdmin, async (req, res) => {
  try {
    console.log('🔄 [SYNC] Starting MikroTik client sync...');

    // Attempt to connect on-demand — do NOT rely on cached connected state
    let secrets;
    try {
      secrets = await mikrotik.getPPPoESecrets();
    } catch (connErr) {
      console.error('❌ [SYNC] Cannot connect to MikroTik:', connErr.message);
      return res.status(503).json({ error: 'Cannot reach MikroTik router. Check your connection settings.' });
    }

    if (!secrets || secrets.length === 0) {
      return res.json({ success: true, message: 'No PPPoE secrets found on the router.', imported: 0, skipped: 0, total: 0 });
    }

    console.log(`📡 [SYNC] Fetched ${secrets.length} PPPoE secrets from router.`);

    // Build a map of existing clients by pppoe_user for fast lookup
    const existingClients = db.prepare('SELECT id, pppoe_user FROM clients').all();
    const existingMap = new Map(existingClients.map(c => [(c.pppoe_user || '').toLowerCase().trim(), c.id]));

    let importedCount = 0;
    let skippedCount = 0;

    db.transaction(() => {
      for (const s of secrets) {
        const username = (s.name || '').trim();
        const usernameLower = username.toLowerCase();

        if (!username) continue;

        // ─── ALREADY EXISTS: skip (non-destructive) ───
        if (existingMap.has(usernameLower)) {
          skippedCount++;
          console.log(`⏭️ [SYNC] Skipping [${username}] — already in system.`);
          continue;
        }

        // ─── NEW CLIENT: import from router ───
        // Parse full name from MikroTik comment field (format: "Full Name | Due: ...")
        let fullName = username;
        if (s.comment && s.comment.trim()) {
          const commentParts = s.comment.split('|');
          if (commentParts[0] && commentParts[0].trim()) {
            fullName = commentParts[0].trim();
          }
        }

        // Generate a unique sequential Account ID (ACC-XXXX)
        const lastClient = db.prepare(
          "SELECT account_id FROM clients WHERE account_id LIKE 'ACC-%' ORDER BY CAST(SUBSTR(account_id, 5) AS INTEGER) DESC LIMIT 1"
        ).get();
        let nextNum = 1001;
        if (lastClient) {
          const parsed = parseInt((lastClient.account_id || '').replace('ACC-', ''));
          if (!isNaN(parsed)) nextNum = parsed + 1;
        }
        let account_id = `ACC-${nextNum}`;
        while (db.prepare('SELECT id FROM clients WHERE account_id = ?').get(account_id)) {
          nextNum++;
          account_id = `ACC-${nextNum}`;
        }

        // Try to parse next due date from MikroTik comment
        let next_due_date = null;
        if (s.comment) {
          const dueMatch =
            s.comment.match(/Due:\s*([A-Za-z]+\s+\d+,\s+\d+)/i) ||
            s.comment.match(/Due:\s*(\d{4}-\d{2}-\d{2})/i);
          if (dueMatch) {
            const parsedDate = new Date(dueMatch[1]);
            if (!isNaN(parsedDate.getTime())) {
              next_due_date = parsedDate.toISOString().split('T')[0];
            }
          }
        }
        // Default: 30 days from today if no due date found
        if (!next_due_date) {
          const d = new Date();
          d.setDate(d.getDate() + 30);
          next_due_date = d.toISOString().split('T')[0];
        }

        const billing_day = new Date(next_due_date + 'T00:00:00').getDate() || 1;

        // Look up plan by MikroTik profile name (case-insensitive)
        const profileLower = String(s.profile || '').toLowerCase().trim();
        const planObj = db.prepare(
          'SELECT * FROM plans WHERE LOWER(name) = ? OR LOWER(id) = ? LIMIT 1'
        ).get(profileLower, profileLower);
        const planName = planObj ? planObj.name : (s.profile || '20MBPS');
        const monthly_rate = planObj ? planObj.price : 1000;

        const sanitizedPass = s.password ? sanitizePassword(String(s.password)) : '1234';
        const installDate = new Date().toISOString().split('T')[0];
        const status = s.disabled ? 'disabled' : 'active';

        console.log(`✅ [SYNC] Importing [${username}] as "${fullName}" (Plan: ${planName}, Status: ${status})`);

        db.prepare(`
          INSERT INTO clients (
            account_id, full_name, address, contact, email,
            pppoe_user, pppoe_pass, web_password, must_change_password,
            plan, monthly_rate, vlan_id, olt_port, status,
            ip_address, mac_address, signal_strength,
            installation_date, next_due_date, billing_day, service, latitude, longitude
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          account_id, fullName, '', '', '',
          username, sanitizedPass, sanitizedPass, 1,
          planName, monthly_rate, 100, '1/1/1', status,
          s.remoteAddress || '', '', '',
          installDate, next_due_date, billing_day, 'pppoe', null, null
        );

        // Create a legacy-paid installation record
        const newClient = db.prepare('SELECT id FROM clients WHERE account_id = ?').get(account_id);
        if (newClient) {
          db.prepare(`
            INSERT INTO installations (client_id, amount_due, amount_paid, status, remarks, paid_date)
            VALUES (?, 0, 0, 'Paid', 'Imported from MikroTik PPPoE secret', ?)
          `).run(newClient.id, installDate);
        }

        importedCount++;
        // Add to map so duplicate names within same batch don't collide
        existingMap.set(usernameLower, -1);
      }
    })();

    const totalOnRouter = secrets.length;
    console.log(`✅ [SYNC] Done. Imported: ${importedCount}, Skipped (already exist): ${skippedCount}`);

    let message;
    if (importedCount === 0 && skippedCount > 0) {
      message = `All ${skippedCount} PPPoE secrets are already in the system. No new clients to import.`;
    } else if (importedCount > 0) {
      message = `Sync complete! ${importedCount} new client${importedCount > 1 ? 's' : ''} imported from router.${skippedCount > 0 ? ` (${skippedCount} already existed)` : ''}`;
    } else {
      message = 'Sync complete. No clients found on router.';
    }

    res.json({
      success: true,
      message,
      imported: importedCount,
      skipped: skippedCount,
      total: totalOnRouter
    });
  } catch (err) {
    console.error('❌ [SYNC MIKROTIK] Error:', err);
    res.status(500).json({ error: 'Sync failed: ' + err.message });
  }
});

router.get('/clients/:id', requireAdmin, (req, res) => {
  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id);
  if (client) res.json(client);
  else res.status(404).json({ error: 'Client not found' });
});

// ─── Export Clients to CSV ───
router.get('/clients/export/csv', requireAdmin, (req, res) => {
  try {
    const clients = db.prepare('SELECT * FROM clients ORDER BY full_name ASC').all();

    const escape = (val) => {
      if (val === null || val === undefined) return '';
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const headers = ['Account ID', 'Full Name', 'PPPoE User', 'Plan', 'Monthly Rate', 'Status', 'Due Date', 'Installation Date', 'Contact', 'Email', 'Address', 'Service'];
    const rows = clients.map(c => [
      c.account_id, c.full_name, c.pppoe_user, c.plan,
      c.monthly_rate, c.status, c.next_due_date,
      c.installation_date, c.contact, c.email, c.address, c.service
    ].map(escape).join(','));

    const csv = [headers.join(','), ...rows].join('\r\n');
    const today = new Date().toISOString().split('T')[0];
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="clients_${today}.csv"`);
    res.send(csv);
    console.log(`📊 [EXPORT] ${clients.length} clients exported to CSV by admin`);
  } catch (err) {
    res.status(500).json({ error: 'Export failed: ' + err.message });
  }
});


// Toggle route removed as per user request

// ─── Applications ───
router.get('/applications', requireAdmin, (req, res) => {
  const apps = db.prepare('SELECT * FROM applications ORDER BY created_at DESC').all();
  res.json(apps);
});

// ─── Provision Preview: Generate suggested Account ID + PPPoE credentials ───
router.get('/applications/:id/provision-preview', requireAdmin, async (req, res) => {
  try {
    const app = db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id);
    if (!app) return res.status(404).json({ error: 'Application not found' });

    // Generate sequential Account ID
    const lastClient = db.prepare(
      "SELECT account_id FROM clients WHERE account_id LIKE 'ACC-%' ORDER BY CAST(SUBSTR(account_id, 5) AS INTEGER) DESC LIMIT 1"
    ).get();
    let nextNum = 1001;
    if (lastClient) {
      const parsed = parseInt((lastClient.account_id || '').replace('ACC-', ''));
      if (!isNaN(parsed)) nextNum = parsed + 1;
    }
    let account_id = `ACC-${nextNum}`;

    // Generate PPPoE username from full name
    const nameParts = (app.full_name || 'client').toLowerCase().trim().split(/\s+/);
    let suggestedPppoeUser = nameParts.join('.').replace(/[^a-z0-9.]/g, '');

    res.json({
      account_id,
      pppoe_user: suggestedPppoeUser,
      default_password: `fibr${nextNum}`,
      plan: app.desired_plan,
      mikrotik_profiles: [],
      suggested_profile: 'default',
      mikrotik_online: false
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/applications/:id', requireAdmin, async (req, res) => {
  try {
    const { status, admin_notes, scheduled_date, pppoe_user, pppoe_pass, pppoe_profile, plan } = req.body;
    const app = db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id);
    
    if (!app) return res.status(404).json({ error: 'Application not found' });

    const prevStatus = app.status;
    const prevDate = app.scheduled_date;
    const finalDate = scheduled_date !== undefined ? (scheduled_date || null) : app.scheduled_date;
    const adminName = (req.session.admin && req.session.admin.fullName) || 'Administrator';

    db.prepare('UPDATE applications SET status = ?, admin_notes = ?, reviewed_by = ?, scheduled_date = ? WHERE id = ?')
      .run(status || app.status, admin_notes || app.admin_notes || '', adminName, finalDate, req.params.id);

    // ─── AUTO-PROVISIONING: Create Client + Push MikroTik + Send Credentials ───
    let provisionResult = null;
    if (status === 'approved' && prevStatus !== 'approved' && pppoe_user && pppoe_pass) {
      try {
        const settings = getSettings();

        // 1. Generate sequential, duplicate-safe Account ID
        const lastClient = db.prepare(
          "SELECT account_id FROM clients WHERE account_id LIKE 'ACC-%' ORDER BY CAST(SUBSTR(account_id, 5) AS INTEGER) DESC LIMIT 1"
        ).get();
        let nextNum = 1001;
        if (lastClient) {
          const parsed = parseInt((lastClient.account_id || '').replace('ACC-', ''));
          if (!isNaN(parsed)) nextNum = parsed + 1;
        }
        let account_id = `ACC-${nextNum}`;
        while (db.prepare('SELECT id FROM clients WHERE account_id = ?').get(account_id)) {
          nextNum++;
          account_id = `ACC-${nextNum}`;
        }

        // 2. Compute due date
        const today = new Date().toISOString().split('T')[0];
        const installDate = scheduled_date || today;
        const nextDue = calculateNextDue(installDate, installDate);
        const finalPlan = plan || app.desired_plan || '20MBPS';

        // 3. Find plan rate
        const planObj = db.prepare('SELECT * FROM plans WHERE name = ? OR id = ? LIMIT 1').get(finalPlan, finalPlan);
        const monthly_rate = planObj ? planObj.price : 0;

        // 4. Insert client record
        db.prepare(`
          INSERT INTO clients (
            account_id, full_name, address, contact, email,
            pppoe_user, pppoe_pass, web_password, must_change_password, plan, monthly_rate,
            vlan_id, olt_port, status, ip_address, mac_address,
            signal_strength, installation_date, next_due_date, service,
            latitude, longitude, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          account_id, app.full_name, app.address || '', app.contact || '', app.email || '',
          pppoe_user, sanitizePassword(pppoe_pass), sanitizePassword(pppoe_pass), 1, finalPlan, monthly_rate,
          100, '1/1/1', 'active', '', '',
          '', installDate, nextDue, 'pppoe',
          app.latitude || null, app.longitude || null,
          new Date().toISOString(), new Date().toISOString()
        );

        // 5. Push to MikroTik — only attempt if actually connected
        let mikrotikPushed = false;
        if (mikrotik.connected) {
          try {
            // Use admin-selected profile from modal dropdown (guaranteed to match MikroTik)
            // Fallback: extract speed from plan name (e.g. "Standard 20Mbps" → "20MBPS")
            const speedMatch = finalPlan.match(/(\d+)/);
            const mikrotikProfile = pppoe_profile ||
              planObj?.mikrotik_profile ||
              (speedMatch ? `${speedMatch[1]}MBPS` : 'default');

            await mikrotik.addPPPoESecret(
              pppoe_user,
              pppoe_pass,
              mikrotikProfile,
              `${app.full_name} | Due: ${formatDateMDY(nextDue)}`,
              'pppoe'
            );
            mikrotikPushed = true;
            console.log(`✅ [PROVISION] PPPoE secret pushed to MikroTik for [${pppoe_user}] (Profile: ${mikrotikProfile})`);
          } catch (mkErr) {
            console.warn(`⚠️ [PROVISION] MikroTik push failed: ${mkErr.message}`);
          }
        } else {
          console.warn(`⚠️ [PROVISION] MikroTik offline — [${pppoe_user}] not pushed. Push manually from Clients page.`);
        }

        // 6. Log the provisioning event
        db.prepare('INSERT INTO events(type, pppoe_user, caller_id, ip_address, timestamp) VALUES (?, ?, ?, ?, ?)')
          .run('ACCOUNT_CREATED', pppoe_user, adminName, `App #${req.params.id} approved → ${account_id}`, new Date().toISOString());

        // 7. Send Welcome Email — Portal credentials only (no PPPoE details)
        if (app.email && app.email.includes('@')) {
          const emailContent = templates.welcomeWithCredentials(app.full_name, account_id, pppoe_pass, finalPlan);
          sendEmail(app.email, `Welcome to ${settings.company_name || 'ISP'} — Your Account is Ready!`, emailContent.text, emailContent.html).catch(() => {});
        }

        // 8. Send Welcome SMS — Portal credentials only (no PPPoE details)
        if (app.contact) {
          const companyName = settings.company_name || "SJKM NETWORK DATA LINK";
          const smsMsg = `${companyName}\n\nWelcome to our service!\n\nYour internet account is now ACTIVE.\n\nAccount No: ${account_id}\nPassword: ${pppoe_pass}\nPlan: ${finalPlan}\n\nLog in using your Account No. and the password above. Please change it after first login.`;
          sendSMS(app.contact, smsMsg, app.full_name).catch(() => {});
        }

        provisionResult = { account_id, pppoe_user, mikrotikPushed };
        console.log(`✅ [PROVISION] Client [${account_id}] created from application #${req.params.id}`);

      } catch (provErr) {
        console.error('❌ [PROVISION] Auto-provisioning failed:', provErr.message);
        return res.status(500).json({ error: 'Application approved but account creation failed: ' + provErr.message });
      }
    }

    // ─── Standard Notifications (email/SMS for non-provisioned approvals) ───
    const settings = getSettings();
    const brand = settings.company_name;

    // Send generic approval/installation email even if provisioned
    if (app.email && app.email.includes('@')) {
      if (status === 'approved' && prevStatus !== 'approved') {
        process.nextTick(async () => {
          try {
            let emailContent, subject;
            const isFirstDate = !prevDate;
            if (scheduled_date) {
               const verb = isFirstDate ? 'Scheduled' : 'Rescheduled';
               emailContent = templates.installationScheduled(app.full_name, scheduled_date, admin_notes);
               subject = `Installation ${verb} - Welcome to ${brand}`;
            } else {
               emailContent = templates.applicationApproved(app.full_name, admin_notes);
               subject = `Application APPROVED - Welcome to ${brand}`;
            }
            await sendEmail(app.email, subject, emailContent.text, emailContent.html);
          } catch (e) { console.error('[EMAIL-DELAYED-ERROR]', e); }
        });
      } else if (scheduled_date && (scheduled_date !== prevDate) && status === 'approved') {
        // Admin changed the date on an already-approved application
        process.nextTick(async () => {
           try {
             const isFirstDate = !prevDate;
             const verb = isFirstDate ? 'Scheduled' : 'Rescheduled';
             const emailContent = templates.installationScheduled(app.full_name, scheduled_date, admin_notes || app.admin_notes);
             await sendEmail(app.email, `Installation ${verb} - ${brand}`, emailContent.text, emailContent.html);
           } catch (e) {}
        });
      }

      if (status === 'rejected' && prevStatus !== 'rejected') {
        process.nextTick(async () => {
          try {
            const emailContent = templates.applicationRejected(app.full_name, admin_notes);
            await sendEmail(app.email, `Application Update - ${brand}`, emailContent.text, emailContent.html);
          } catch (e) {}
        });
      }
    }
    
    // SMS for status changes (Respect Toggle)
    if (settings.enable_sms_alerts && app.contact) {
      const brandClean = settings.company_name || "SJKM NETWORK DATA LINK";
      if (status === 'approved' && prevStatus !== 'approved') {
        // ✅ Approved (no provisioning) — send approval notification
        process.nextTick(async () => {
          try {
            const prettyDate = scheduled_date ? formatDateMDY(scheduled_date) : 'TO BE SET';
            const isFirstDate = !prevDate; // first time setting a date
            const companyName = settings.company_name || "SJKM NETWORK DATA LINK";
            if (scheduled_date) {
              await sendSMS(app.contact, `${companyName}\n\nInstallation Approved\nDate: ${prettyDate}\nWelcome to ${brandClean}! Your application has been approved.`, app.full_name);
            } else {
              await sendSMS(app.contact, `${companyName}\n\nApplication Approved\nHello ${app.full_name}, your application has been approved! Our team will contact you for installation. Welcome to ${brandClean}!`, app.full_name);
            }
          } catch (e) {}
        });
      } else if (status === 'rejected' && prevStatus !== 'rejected') {
        // ✅ Rejected
        process.nextTick(async () => {
          try {
            const companyName = settings.company_name || "SJKM NETWORK DATA LINK";
            await sendSMS(app.contact, `${companyName}\n\nApplication Update\nStatus: Rejected\nReason: ${admin_notes || 'Criteria not met'}`, app.full_name);
          } catch (e) {}
        });
      } else if (scheduled_date && (scheduled_date !== prevDate) && status === 'approved') {
        // ✅ Admin is changing the installation date on an ALREADY-approved application
        process.nextTick(async () => {
          try {
            const companyName = settings.company_name || "SJKM NETWORK DATA LINK";
            await sendSMS(app.contact, `${companyName}\n\nInstallation Update\nNew Date: ${formatDateMDY(scheduled_date)}`, app.full_name);
          } catch (e) {}
        });
      }
    }

    res.json({ success: true, ...(provisionResult || {}) });
  } catch (err) {
    console.error('❌ Application Update Error:', err);
    res.status(500).json({ error: err.message });
  }
});


router.delete('/applications/:id', requireAdmin, (req, res) => {
  try {
    db.prepare('DELETE FROM applications WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/tickets', requireAdmin, (req, res) => {
  try {
    const tickets = db.prepare('SELECT * FROM support_tickets ORDER BY created_at DESC').all();
    // Parse JSON messages thread
    const parsedTickets = tickets.map(t => ({
      ...t,
      messages: t.messages ? JSON.parse(t.messages) : []
    }));
    res.json(parsedTickets);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/tickets/:id', requireAdmin, (req, res) => {
  try {
    const { status, admin_reply } = req.body;
    const ticketId = req.params.id;

    // 1. Fetch ticket to get email & subject
    const ticket = db.prepare('SELECT * FROM support_tickets WHERE id = ?').get(ticketId);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

    // 2. Perform the update (Handle threaded messages)
    const now = new Date().toISOString();
    let thread = [];
    try { 
      thread = JSON.parse(ticket.messages || '[]'); 
    } catch(e) { thread = []; }

    // If there is a reply, append it to the thread
    if (admin_reply && admin_reply.trim()) {
      thread.push({
        sender: 'admin',
        text: admin_reply.trim(),
        timestamp: now,
        replied_by: req.session.admin.fullName || req.session.admin.username
      });
    }

    // UPDATED: Removed non-existent admin_reply/replied_by columns from UPDATE query
    db.prepare('UPDATE support_tickets SET status = ?, messages = ?, updated_at = ? WHERE id = ?')
      .run(status, JSON.stringify(thread), now, ticketId);
    
    // 3. Send Email Notification
    if (ticket.email && ticket.email.includes('@')) {
      let emailContent;
      if (admin_reply && admin_reply.trim()) {
        emailContent = templates.ticketReplied(ticket.full_name, ticket.subject, admin_reply);
      } else if (status === 'closed') {
        emailContent = templates.ticketResolved(ticket.full_name, ticket.subject);
      }

      if (emailContent) {
        sendEmail(ticket.email, `Support Update: ${ticket.subject}`, emailContent.text, emailContent.html).catch(() => {});
      }
    }
    
    // Pairing SMS for Ticket Reply / Resolution
    const clientForTicket = db.prepare('SELECT contact, full_name FROM clients WHERE email = ? OR full_name = ?').get(ticket.email, ticket.full_name);
    if (clientForTicket && clientForTicket.contact) {
      const settings = db.prepare('SELECT * FROM settings LIMIT 1').get() || {};
      const companyName = settings.company_name || "SJKM NETWORK DATA LINK";
      let smsMsg = "";
      if (admin_reply && admin_reply.trim()) {
        smsMsg = `${companyName}\n\nSupport Update\nTicket: ${ticket.subject}\nStatus: Replied`;
      } else if (status === 'closed') {
        smsMsg = `${companyName}\n\nTicket Resolved\nTicket: ${ticket.subject}\nStatus: Completed`;
      }

      if (smsMsg) {
        sendSMS(clientForTicket.contact, smsMsg, clientForTicket.full_name);
      }
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Payments ───
router.get('/payments', requireAdmin, (req, res) => {
  const { clientId } = req.query;
  let query = `
    SELECT p.*, c.full_name, c.account_id, c.plan 
    FROM payments p 
    JOIN clients c ON p.client_id = c.id 
  `;
  const params = [];
  
  if (clientId) {
    query += ` WHERE p.client_id = ? `;
    params.push(clientId);
  }
  
  query += ` ORDER BY p.created_at DESC `;
  
  const payments = db.prepare(query).all(...params);
  res.json(payments);
});

router.delete('/payments/:id', requireAdmin, async (req, res) => {
  try {
    const paymentId = parseInt(req.params.id);
    const { rollback, reason } = req.body; 

    if (isNaN(paymentId)) {
        return res.status(400).json({ error: 'Invalid payment ID' });
    }

    // 1. Get payment details before deleting
    const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(paymentId);
    if (!payment) return res.status(404).json({ error: 'Payment record not found' });

    const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(payment.client_id);
    
    // Use a transaction for DB operations to ensure atomicity
    const performDbOperations = db.transaction(() => {
        let rollbackMsg = '';
        if (rollback && client) {
            // DELETE the payment FIRST
            db.prepare('DELETE FROM payments WHERE id = ?').run(paymentId);
            
            // 📝 LOG: Payment Voided
            logActivity('Billing', 'Payment Voided', {
                payment_id: paymentId,
                amount: payment.amount,
                client_name: client.full_name,
                original_due_date: payment.due_date
            }, 'System Admin', client.id);
            
            // RECALCULATE: Find the REAL current due date from remaining payments
            const remaining = db.prepare("SELECT due_date FROM payments WHERE client_id = ? AND status = 'paid' ORDER BY due_date DESC LIMIT 1").get(client.id);
            
            // Fallback
            const newDate = remaining ? remaining.due_date : (payment.previous_due_date || client.installation_date || client.next_due_date);
            
            // Deduct from wallet balance safely
            const newWallet = Math.max(0, (client.wallet_balance || 0) - payment.amount);
            
            // Update client date and wallet
            db.prepare("UPDATE clients SET next_due_date = ?, wallet_balance = ? WHERE id = ?").run(newDate, newWallet, client.id);
            
            // Automated Status Correction
            const now = new Date();
            const dNew = parseDateStrict(newDate);
            const settings = getSettings();
            const graceDays = (settings.grace_period || 3);
            const isOverdue = dNew && (new Date(dNew.getTime() + (graceDays * 24 * 60 * 60 * 1000)) < now);

            const newStatus = isOverdue ? 'unpaid' : 'active';
            db.prepare("UPDATE clients SET status = ? WHERE id = ?").run(newStatus, client.id);
            
            rollbackMsg = ` | Rolled back to ${newDate} (Status: ${newStatus.toUpperCase()})`;
            
            return { rollbackMsg, isOverdue, newDate, newStatus };
        } else {
            db.prepare('DELETE FROM payments WHERE id = ?').run(paymentId);
            
            // 📝 LOG: Payment Voided (Simple Delete)
            logActivity('Billing', 'Payment Deleted', {
                payment_id: paymentId,
                amount: payment.amount,
                client_name: client ? client.full_name : 'Unknown',
                reason: reason || 'Administrative Delete'
            }, 'System Admin', client ? client.id : null);

            return { rollbackMsg: '', isOverdue: false, newDate: null, newStatus: client ? client.status : 'active' };
        }
    });

    const { rollbackMsg, isOverdue, newDate } = performDbOperations();

    // 3. Log to System Events (Outside transaction as it's secondary)
    db.prepare('INSERT INTO events(type, pppoe_user, caller_id, ip_address, timestamp) VALUES (?, ?, ?, ?, ?)').run(
        'PAYMENT_VOIDED', 
        client ? client.pppoe_user : 'System', 
        req.session.admin.username, 
        `Voided: ₱${payment.amount}${reason ? ' - Reason: ' + reason : ''}${rollbackMsg}`,
        new Date().toISOString()
    );

    // 4. MikroTik Synchronization (Outside transaction as it's an external API call)
    if (rollback && client) {
        const pppoeUser = (client.pppoe_user || '').toString().trim();
        if (pppoeUser && pppoeUser.length >= 2) {
            const settings = getSettings();
            if (isOverdue) {
                console.log(`📡 [VOID] Suspending [${pppoeUser}] on MikroTik due to rollback...`);
                const targetUnpaidProfile = settings.unpaid_profile_name || 'unpaid';
                await mikrotik.switchToUnpaid(pppoeUser, targetUnpaidProfile).catch(e => console.error(`❌ Void Suspension Failed:`, e.message));
                await mikrotik.reconnectUser(pppoeUser).catch(e => console.error(`❌ Void Kicker Failed:`, e.message));
            } else {
                console.log(`📡 [VOID] Restoring [${pppoeUser}] on MikroTik due to rollback...`);
                const planName = client.plan || 'default';
                await mikrotik.restoreToPlan(pppoeUser, planName).catch(e => console.error(`❌ Void Restoration Failed:`, e.message));
                await mikrotik.updatePPPoESecret(pppoeUser, { 
                  comment: `${client.full_name} | Due: ${formatDateMDY(newDate)}` 
                }).catch(e => console.error(`❌ Void Comment Sync Failed:`, e.message));
            }
        }
    }

    console.log(`🗑️ Payment ${paymentId} voided by ${req.session.admin.username}${rollbackMsg}`);
    res.json({ success: true, rolledBack: !!rollback });
  } catch (err) {
    console.error('❌ Void Payment Error:', err);
    res.status(500).json({ error: 'Server error during voiding: ' + err.message });
  }
});

// Create new client
router.post('/clients', requireAdmin, async (req, res) => {
  try {
    const { 
      full_name, email, contact, plan, pppoe_user, pppoe_pass, 
      installation_date, next_due_date, address, monthly_rate, vlan_id, olt_port, service,
      latitude, longitude
    } = req.body;

    if (!full_name) {
      return res.status(400).json({ error: 'Client Name is required' });
    }
    
    // If next_due_date is provided, use it. Otherwise, default to something sensible.
    let finalNextDue = next_due_date;
    let cycleDay = 17;

    if (finalNextDue) {
      const d = parseDateStrict(finalNextDue);
      if (d) cycleDay = d.getDate();
    } else {
       // Fallback logic if no date provided
       const computeDate = installation_date || new Date().toLocaleDateString('en-CA');
       const { calculateCycleDate } = require('../utils/shared');
       finalNextDue = calculateCycleDate(17, computeDate);
       cycleDay = 17;
    }

    // 2. Save to Database
    // ✅ Use real SQLite query instead of db.data.plans (mock object)
    const activePlan = db.prepare('SELECT * FROM plans WHERE id = ? OR name = ? LIMIT 1').get(plan, plan);
    const defaultRate = activePlan ? activePlan.price : 1000;
    const calculatedRate = (monthly_rate !== '' && monthly_rate != null) ? monthly_rate : defaultRate;
    const installDate = (installation_date && installation_date !== "") 
      ? (() => { const d = parseDateStrict(installation_date); return d ? d.toLocaleDateString('en-CA') : installation_date; })()
      : null;

    const nextDue = finalNextDue;
    const account_id = 'ACC-' + (1000 + Math.floor(Math.random() * 9000));

    const sanitizedUser = pppoe_user ? String(pppoe_user).trim().toLowerCase() : account_id.toLowerCase();
    const sanitizedPass = pppoe_pass ? sanitizePassword(pppoe_pass) : '1234';

    db.prepare(`
      INSERT INTO clients (
        account_id, full_name, address, contact, email, 
        pppoe_user, pppoe_pass, web_password, must_change_password, plan, monthly_rate, 
        vlan_id, olt_port, status, ip_address, mac_address, 
        signal_strength, installation_date, next_due_date, billing_day, service, latitude, longitude
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      account_id, full_name, address || '', contact || '', email || '',
      sanitizedUser, sanitizedPass, sanitizedPass, 1, plan || '20MBPS', calculatedRate,
      vlan_id || 100, olt_port || '1/1/1', 'active', '', '', '',
      installDate, nextDue, cycleDay, service || 'pppoe', 
      (latitude && latitude !== "") ? latitude : null, 
      (longitude && longitude !== "") ? longitude : null
    );

    // ─── Auto-Create Installation Record ───
    const newClient = db.prepare('SELECT id FROM clients WHERE account_id = ?').get(account_id);
    if (newClient) {
        const installDue = parseFloat(req.body.install_due) || 0;
        const installPaid = parseFloat(req.body.install_paid) || 0;
        const isLegacy = req.body.is_legacy === 'on' || req.body.is_legacy === true;

        let status = 'Pending';
        if (isLegacy || installDue === 0 || (installDue > 0 && installPaid >= installDue)) status = 'Paid';
        else if (installPaid > 0) status = 'Partial';

        db.prepare(`
          INSERT INTO installations (client_id, amount_due, amount_paid, status, remarks, paid_date)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          newClient.id, 
          isLegacy ? 0 : installDue, 
          isLegacy ? 0 : installPaid, 
          status, 
          isLegacy ? 'Legacy Client (Already Paid)' : 'Initial record from onboarding',
          installPaid > 0 ? new Date().toISOString().split('T')[0] : null
        );
    }

    res.status(201).json({ success: true, account_id });
    } catch (err) {
      console.error('❌ [CREATE CLIENT] Error:', err);
      res.status(500).json({ error: 'Failed to create client: ' + err.message });
    }
});

// Update client
router.put('/clients/:id', requireAdmin, async (req, res) => {
  try {
    const { 
      full_name, email, contact, plan, pppoe_user, pppoe_pass, 
      installation_date, billing_day, address, monthly_rate, service,
      latitude, longitude, next_due_date
    } = req.body;

    // ✅ Use real SQLite query instead of db.data.plans (mock object)
    const activePlan = db.prepare('SELECT * FROM plans WHERE id = ? OR name = ? LIMIT 1').get(plan, plan);
    const defaultRate = activePlan ? activePlan.price : (monthly_rate || 0);
    const calculatedRate = (monthly_rate !== '' && monthly_rate != null) ? monthly_rate : defaultRate;

    const existing = db.prepare('SELECT * FROM clients WHERE id = ?').get(parseInt(req.params.id));
    if (!existing) return res.status(404).json({ error: 'Client not found' });

    // Initialize web password variables
    let webPasswordUpdate = '';
    let webPasswordParam = null;

    // Strictly enforce whatever due date the admin specifies
    let finalNextDue = next_due_date || existing.next_due_date;
    let finalBillingDay = existing.billing_day || 17;

    if (next_due_date) {
        const d = parseDateStrict(next_due_date);
        if (d) finalBillingDay = d.getDate();
    }

    // Support for Manual Web Password override or Force Reset
    if (req.body.web_password) {
        webPasswordUpdate += ', web_password = ?';
        webPasswordParam = sanitizePassword(req.body.web_password);
    } else if (existing && pppoe_pass !== undefined && pppoe_pass !== existing.pppoe_pass) {
        // Auto-sync PPPoE pass to web pass if changed
        webPasswordUpdate += ', web_password = ?';
        webPasswordParam = sanitizePassword(pppoe_pass);
    }

    if (req.body.force_reset === 'true' || req.body.force_reset === true) {
        webPasswordUpdate += ', must_change_password = 1';
    }

    const sanitizedUser = (pppoe_user !== undefined) ? String(pppoe_user).trim().toLowerCase() : (existing.pppoe_user || '');
    const sanitizedPass = (pppoe_pass !== undefined) ? sanitizePassword(pppoe_pass) : (existing.pppoe_pass || '');

    const stmt = db.prepare(`
      UPDATE clients SET 
        full_name = ?, email = ?, contact = ?, plan = ?, 
        pppoe_user = ?, pppoe_pass = ?, installation_date = ?, 
        next_due_date = ?, billing_day = ?, address = ?, 
        service = ?, latitude = ?, longitude = ?, updated_at = CURRENT_TIMESTAMP ${webPasswordUpdate}
      WHERE id = ?
    `);

    const params = [
      full_name || existing.full_name, 
      email || existing.email, 
      contact || existing.contact, 
      plan || existing.plan, 
      sanitizedUser, sanitizedPass, 
      (installation_date !== undefined) ? (() => { const d = parseDateStrict(installation_date); return d ? d.toLocaleDateString('en-CA') : (installation_date || ''); })() : existing.installation_date, 
      (finalNextDue && finalNextDue !== "") ? (() => { const d = parseDateStrict(finalNextDue); return d ? d.toLocaleDateString('en-CA') : finalNextDue; })() : (existing.next_due_date || ''), 
      finalBillingDay,
      (address !== undefined) ? (address || '') : existing.address, 
      service || existing.service || 'pppoe', 
      (latitude !== undefined && latitude !== "" && latitude !== null) ? latitude : existing.latitude, 
      (longitude !== undefined && longitude !== "" && longitude !== null) ? longitude : existing.longitude
    ];
    if (webPasswordParam) params.push(webPasswordParam);
    params.push(parseInt(req.params.id));

    stmt.run(...params);

    if (req.body.push_to_router === 'true' || req.body.push_to_router === true) {
        // ✅ Resolve MikroTik profile correctly:
        // 1. Use plan's mikrotik_profile field (exact match to MikroTik)
        // 2. Fallback to plan name
        // 3. Fallback to whatever was passed as plan string
        const mikrotikProfile = activePlan?.mikrotik_profile || activePlan?.name || plan || 'default';
        console.log(`🚀 Auto-Push: Updating [${sanitizedUser}] on MikroTik with profile [${mikrotikProfile}]...`);
        await mikrotik.updatePPPoESecret(existing.pppoe_user, {
            name: sanitizedUser,
            password: sanitizedPass,
            profile: mikrotikProfile,
            service: service || 'pppoe',
            comment: `${full_name} | Due: ${formatDateMDY(finalNextDue)}`
        }).catch(err => console.error('❌ Auto-Push Failed:', err.message));
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[CLIENT UPDATE ERROR]', err);
    res.status(500).json({ error: 'Failed to update client: ' + err.message });
  }
});

// Delete client (Deletes from system database ONLY, does NOT remove from MikroTik)
router.delete('/clients/:id', requireAdmin, async (req, res) => {
  try {
    const existing = db.prepare('SELECT pppoe_user, full_name FROM clients WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Client not found' });

    // Remove from local database and cascade delete related data
    db.transaction(() => {
      // Delete from all tables referencing this client
      db.prepare('DELETE FROM payments WHERE client_id = ?').run(req.params.id);
      db.prepare('DELETE FROM payment_proofs WHERE client_id = ?').run(req.params.id);
      db.prepare('DELETE FROM support_tickets WHERE client_id = ?').run(req.params.id);
      db.prepare('DELETE FROM portal_notices WHERE client_id = ?').run(req.params.id);
      db.prepare('DELETE FROM installations WHERE client_id = ?').run(req.params.id);
      
      // Finally delete the client
      db.prepare('DELETE FROM clients WHERE id = ?').run(req.params.id);
    })();

    console.log(`🗑️ [DELETE] Client [${existing.full_name}] deleted from system database.`);
    res.json({ success: true, message: 'Client removed from system.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete client' });
  }
});

// Bulk removal of Push to Router (DELETED per user request)
router.get('/router-stats', requireAdmin, async (req, res) => {
  res.json({ success: true, message: "Bulk Push disabled for safety" });
});

// 🛡️ UNIFIED DISCONNECT / RECONNECT LOGIC
// Both endpoints (:id and body-based) now call the same internal logic.

async function handleDisconnect(idOrPppoe, adminName = 'System') {
  const client = typeof idOrPppoe === 'number' || !isNaN(idOrPppoe)
    ? db.prepare('SELECT * FROM clients WHERE id = ?').get(idOrPppoe)
    : db.prepare('SELECT * FROM clients WHERE pppoe_user = ?').get(idOrPppoe);

  if (!client) throw new Error('Client not found');

  // 1. Update MikroTik (Restricted Access)
  const settings = db.prepare('SELECT unpaid_profile_name FROM settings LIMIT 1').get() || {};
  const unpaidProfile = settings.unpaid_profile_name || 'unpaid';
  
  await mikrotik.switchToUnpaid(client.pppoe_user, unpaidProfile).catch(err => {
      console.warn(`[DISCONNECT] Router update failed for ${client.pppoe_user}:`, err.message);
  });

  // 2. Update local DB
  db.prepare("UPDATE clients SET status = 'disabled' WHERE id = ?").run(client.id);
  logActivity('Network', 'Client Restricted', { pppoe: client.pppoe_user }, adminName, client.id);
  return { success: true };
}

async function handleReconnect(idOrPppoe, nextDueDate = null, adminName = 'System') {
  const client = typeof idOrPppoe === 'number' || !isNaN(idOrPppoe)
    ? db.prepare('SELECT * FROM clients WHERE id = ?').get(idOrPppoe)
    : db.prepare('SELECT * FROM clients WHERE pppoe_user = ?').get(idOrPppoe);

  if (!client) throw new Error('Client not found');

  // 1. Update MikroTik (Full Access)
  const planName = client.plan || 'default';
  await mikrotik.restoreToPlan(client.pppoe_user, planName).catch(err => {
      console.warn(`[RECONNECT] Router update failed for ${client.pppoe_user}:`, err.message);
  });

  // 2. Update local DB
  const updateData = ["status = 'active'"];
  const params = [];
  
  if (nextDueDate) {
      updateData.push("next_due_date = ?");
      params.push(nextDueDate);
      
      const d = parseDateStrict(nextDueDate);
      if (d) {
          updateData.push("billing_day = ?");
          params.push(d.getDate());
      }
  }
  
  params.push(client.id);
  db.prepare(`UPDATE clients SET ${updateData.join(', ')} WHERE id = ?`).run(...params);
  logActivity('Network', 'Client Restored', { pppoe: client.pppoe_user, next_due: nextDueDate }, adminName, client.id);
  return { success: true };
}

// Routes
router.post('/clients/:id/disconnect', requireAdmin, async (req, res) => {
  try {
    const result = await handleDisconnect(req.params.id, req.session.admin.username);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/clients/:id/reconnect', requireAdmin, async (req, res) => {
  try {
    const { next_due_date } = req.body;
    const result = await handleReconnect(req.params.id, next_due_date, req.session.admin.username);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ─── Sales Monitoring ───

router.get('/sales-monitoring', requireAdmin, (req, res) => {
  try {
    const clients = db.prepare('SELECT * FROM clients').all();
    const payments = db.prepare('SELECT * FROM payments').all() || [];
    
    const today = new Date();
    today.setHours(0,0,0,0);
    const in7Days = new Date(today);
    in7Days.setDate(today.getDate() + 7);

    // Revenue Breakdowns
    // 📈 Advanced Analytics
    const oneWeekAgo = new Date(today); oneWeekAgo.setDate(today.getDate() - 7);
    const twoWeeksAgo = new Date(today); twoWeeksAgo.setDate(today.getDate() - 14);
    const sixMonthsAgo = new Date(today); sixMonthsAgo.setMonth(today.getMonth() - 6);
    const oneYearAgo = new Date(today); oneYearAgo.setFullYear(today.getFullYear() - 1);

    // Current Calendar Month boundaries (1st of this month → today)
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    // Previous Calendar Month boundaries
    const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0); // Last day of prev month

    let weekRevenue = 0, lastWeekRevenue = 0;
    let monthRevenue = 0, lastMonthRevenue = 0;
    let sixMonthRevenue = 0, yearRevenue = 0;
    
    // Build a set of valid client IDs so we don't count ghost payments from deleted clients
    const validClientIds = new Set(clients.map(c => c.id));

    // Monthly Growth Trend Logic (Last 12 Months)
    const trendMap = {};
    for (let i = 11; i >= 0; i--) {
        const d = new Date(today);
        d.setMonth(today.getMonth() - i);
        const key = d.toLocaleString('default', { month: 'short' });
        trendMap[key] = 0;
    }

    payments.forEach(p => {
      if (p.status === 'paid') {
        // Skip payments from deleted/non-existent clients
        if (!validClientIds.has(p.client_id)) return;
        
        const pDate = new Date(p.paid_date || p.due_date);
        if (isNaN(pDate.getTime())) return;
        const amt = parseFloat(p.amount) || 0;
        
        if (pDate >= oneWeekAgo) {
            weekRevenue += amt;
        } else if (pDate >= twoWeeksAgo) {
            lastWeekRevenue += amt;
        }

        // Current Calendar Month
        if (pDate >= monthStart) {
            monthRevenue += amt;
        }
        // Previous Calendar Month
        if (pDate >= lastMonthStart && pDate <= lastMonthEnd) {
            lastMonthRevenue += amt;
        }

        if (pDate >= sixMonthsAgo) sixMonthRevenue += amt;
        if (pDate >= oneYearAgo) yearRevenue += amt;

        // Group into Trend Map
        const monthKey = pDate.toLocaleString('default', { month: 'short' });
        if (trendMap[monthKey] !== undefined) {
            trendMap[monthKey] += amt;
        }
      }
    });

    // Fetch actual plan prices via JOIN for collection efficiency
    const clientRates = db.prepare(`
        SELECT c.id, p.price 
        FROM clients c 
        LEFT JOIN plans p ON LOWER(c.plan) = LOWER(p.name) OR LOWER(c.plan) = LOWER(p.id)
        WHERE c.status NOT IN ('disabled', 'deleted', 'inactive')
    `).all();
    
    let expectedRevenue = 0;
    clientRates.forEach(c => {
        expectedRevenue += (parseFloat(c.price) || 0);
    });


    const monthlyTrends = Object.entries(trendMap).map(([month, total]) => ({ month, total }));

    // Fetch Grace Period from settings
    const settings = db.prepare('SELECT * FROM settings LIMIT 1').get() || { grace_period: 3 };
    const gracePeriod = settings.grace_period || 3;

    let overdue = [];
    let upcoming = [];
    
    clients.forEach(c => {
      // Step 4: Use the pre-calculated, persistent next_due_date
      const rawNextDue = c.next_due_date || c.installation_date;
      
      if (rawNextDue) {
        // Robust Date Parsing for Backend (Node.js)
        let nextDue;
        if (rawNextDue.includes('/')) {
            // If MM/DD/YYYY, don't use 'T12:00:00' because Node's Date() constructor fails on it.
            nextDue = new Date(rawNextDue); 
        } else {
            nextDue = new Date(rawNextDue + 'T12:00:00');
        }

        c.next_due_date = rawNextDue;
        
        // Categorize only if valid date
        if (!isNaN(nextDue.getTime())) {
          if (nextDue < today) {
            overdue.push(c);
          } else if (nextDue >= today && nextDue <= in7Days) {
            upcoming.push(c);
          }
        }
      }
    });

    // Build client summaries for SOA table (all clients)
    const clientSummaries = clients.map(c => {
      const cPayments = payments.filter(p => p.client_id === c.id && p.status === 'paid');
      const totalPaid = cPayments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
      
      // Calculate Future Due Date (Current Due + 1 month)
      const currentDue = c.next_due_date || c.installation_date || new Date().toISOString().split('T')[0];
      const futureDue = calculateNextDue(currentDue, null, false);

      return {
        id: c.id,
        full_name: (c.full_name || '').split(' | ')[0], // Safety cleanup in memory
        account_id: c.account_id,
        plan: c.plan,
        monthly_rate: c.plan_price || 0,
        next_due_date: c.next_due_date,
        future_due_date: futureDue,
        total_paid: totalPaid,
        payment_count: cPayments.length,
        status: c.status
      };
    });

    const newInstallDueCount = clientSummaries.filter(c => {
      let nd;
      if (c.next_due_date && c.next_due_date.includes('/')) {
          nd = new Date(c.next_due_date);
      } else {
          nd = new Date(c.next_due_date + 'T12:00:00');
      }
      const in7 = new Date(); in7.setDate(in7.getDate() + 7);
      return c.payment_count === 0 && !isNaN(nd.getTime()) && nd <= in7;
    }).length;

    const pendingProofsCount = db.prepare("SELECT COUNT(*) as count FROM payment_proofs WHERE status = 'pending_verification'").get().count || 0;

    res.json({
      success: true,
      overdue,
      upcoming,
      grace_period: gracePeriod,
      newInstallDueCount,
      pendingProofsCount,
      clientSummaries,
      breakdown: {
        weekly: weekRevenue,
        lastWeekly: lastWeekRevenue,
        monthly: monthRevenue,
        lastMonthly: lastMonthRevenue,
        sixMonths: sixMonthRevenue,
        yearly: yearRevenue,
        expectedMonthly: expectedRevenue,
        monthlyTrends: monthlyTrends
      },
      payments: payments.map(p => {
         const cl = clients.find(cc => cc.id === p.client_id);
         return { ...p, full_name: cl ? cl.full_name : 'Unknown', account_id: cl ? cl.account_id : '', plan: cl ? cl.plan : '', next_due_date: cl ? cl.next_due_date : '' };
      }).sort((a,b) => new Date(b.paid_date || b.due_date) - new Date(a.paid_date || a.due_date))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Event Logs ───
router.get('/events', requireAdmin, (req, res) => {
  try {
    const events = db.prepare('SELECT * FROM events ORDER BY id DESC').all();
    res.json(events);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add Manual Payment Record
router.post('/payments', requireAdmin, async (req, res) => {
  try {
    const { client_id, amount, payment_method, date, remarks } = req.body;
    
    // 1. Fetch Client Current Data (Including Contact for SMS)
    const client = db.prepare('SELECT id, full_name, contact, email, account_id, next_due_date, installation_date, pppoe_user, plan, status, monthly_rate FROM clients WHERE id = ?').get(client_id);
    if (!client) return res.status(404).json({ error: 'Client not found.' });
    
    // 🛡️ VALIDATION: Prevent payment if DUE DATE is not set
    if (!client.next_due_date || client.next_due_date === "") {
      return res.status(400).json({ error: 'Cannot record payment: Client has NO DUE DATE set. Please EDIT the client and set a Due Date first.' });
    }

    // Fetch settings for grace period
    const settings = db.prepare('SELECT * FROM settings LIMIT 1').get() || { grace_period: 3 };
    const gracePeriod = settings.grace_period || 3;

    // 2. Determine Anniversary & Snapshot (Snapshot ORIGINAL date before any updates)
    const todayStr = (() => { const d = parseDateStrict(date || new Date()); return d ? d.toLocaleDateString('en-CA') : (date || new Date().toLocaleDateString('en-CA')); })();
    
    // 🛡️ SAFETY CHECK: Prevent payments with dates too far in the future (e.g. accidentally typing 2027)
    const dCheck = parseDateStrict(todayStr);
    const serverToday = new Date();
    serverToday.setHours(23,59,59,999); // End of today
    if (dCheck && dCheck > new Date(serverToday.getTime() + (30 * 24 * 60 * 60 * 1000))) {
      return res.status(400).json({ error: `Invalid Payment Date: ${todayStr}. You cannot record a payment dated more than 30 days in the future.` });
    }

    const previousDueDateSnapshot = client.next_due_date || client.installation_date || todayStr; // PERFECT SNAPSHOT!

    // Multi-month Payment Detection
    // Use plan price instead of override
    const clientFull = db.prepare(`
      SELECT c.*, p.price as plan_price 
      FROM clients c 
      LEFT JOIN plans p ON LOWER(c.plan) = LOWER(p.name) OR LOWER(c.plan) = LOWER(p.id)
      WHERE c.id = ?
    `).get(client_id);
    
    const monthlyRate = parseFloat(clientFull.plan_price) || 0;
    const paidAmount = parseFloat(amount) || 0;
    
    // Dynamic Wallet & Balance Logic
    let currentWallet = parseFloat(clientFull.wallet_balance) || 0;
    currentWallet += paidAmount;
    
    let monthsToPay = 0;
    if (monthlyRate > 0) {
        while (currentWallet >= monthlyRate) {
            currentWallet -= monthlyRate;
            monthsToPay++;
        }
    } else {
        monthsToPay = 1; // Fallback to advance 1 month if no plan price
    }

    // Check for "Suspended" status to trigger Fair Reset
    const dToday = parseDateStrict(todayStr) || new Date();
    const dDue = parseDateStrict(previousDueDateSnapshot) || dToday;
    const graceDays = (settings.grace_period || 3);
    const isOverdue = dToday > new Date(dDue.getTime() + (graceDays * 24 * 60 * 60 * 1000));
    
    // If the database ALREADY says they are suspended, trust it!
    const isSuspended = isOverdue || (client.status && client.status.toLowerCase().includes('suspended'));

    let finalDueDate = req.body.requested_due_date;

    if (!finalDueDate) {
      // 🛡️ INTELLIGENT DATE GUARD: 
      // If the old due date is more than 6 months in the future or more than 12 months in the past,
      // it is considered 'Corrupted' or 'Stale'. We reset the baseline to Today.
      const sixMonthsLimit = new Date(); sixMonthsLimit.setMonth(sixMonthsLimit.getMonth() + 6);
      const twelveMonthsAgo = new Date(); twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
      
      let safeBaseline = (previousDueDateSnapshot && previousDueDateSnapshot !== 'pppoe') ? previousDueDateSnapshot : todayStr;
      const dSnap = parseDateStrict(safeBaseline);
      if (dSnap && (dSnap > sixMonthsLimit || dSnap < twelveMonthsAgo)) {
         console.log(`⚠️ [DATE-GUARD] Legacy date ${safeBaseline} detected for ${client.full_name}. Resetting baseline to Today for accuracy.`);
         safeBaseline = todayStr;
      }

      if (isSuspended) {
        console.log(`♻️ Suspended Payment: Client ${client.full_name} was suspended. Moving from ${previousDueDateSnapshot} + ${monthsToPay}mo.`);
      } else {
        console.log(`📅 Standard Cycle Move: Client ${client.full_name} is active. Moving from ${previousDueDateSnapshot} + ${monthsToPay}mo.`);
      }
      
      finalDueDate = addMonths(safeBaseline, monthsToPay);
    }

    const newPayment = {
      client_id: parseInt(client_id),
      amount: parseFloat(amount),
      payment_method,
      paid_date: todayStr,
      remarks,
      due_date: finalDueDate,
      status: 'paid'
    };
    
    db.prepare('INSERT INTO payments (client_id, amount, paid_date, due_date, payment_method, status, remarks, previous_due_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(newPayment.client_id, newPayment.amount, newPayment.paid_date, newPayment.due_date, newPayment.payment_method, newPayment.status, newPayment.remarks, previousDueDateSnapshot);
      
    // 📝 LOG: Payment Recorded
    logActivity('Billing', 'Payment Recorded', {
        amount: amount,
        method: payment_method,
        due_date: finalDueDate,
        client_name: client.full_name
    }, req.session?.admin?.username || 'System Admin', client_id);
      
    // 3. Update Client Anniversary (and restore service if it was disabled)
    db.prepare("UPDATE clients SET next_due_date = ?, wallet_balance = ?, status = 'active' WHERE id = ?").run(finalDueDate, currentWallet, client_id);

    // ─── BACKGROUND: MikroTik Restore ───
    const pppoeUser = (client.pppoe_user || '').toString().trim();
    if (pppoeUser && pppoeUser.length >= 2) {
      const activePlan = db.data.plans ? db.data.plans.find(p => p.id === client.plan || p.name === client.plan) : null;
      const mikrotikProfile = activePlan?.mikrotik_profile || (client.plan || '').toUpperCase();
      
      // We use updatePPPoESecret here because it automatically handles ADDING the secret if it's missing (e.g. for test2)
      mikrotik.updatePPPoESecret(pppoeUser, {
          password: client.pppoe_pass,
          profile: mikrotikProfile,
          service: client.service || 'pppoe',
          comment: `${client.full_name} | Due: ${formatDateMDY(finalDueDate)}`
      }).then(() => {
          // ⚡ INSTANT RESTORE: Kick the active session so the user gets the new profile IMMEDIATELY
          mikrotik.reconnectUser(pppoeUser).catch(err => {
              console.error(`[BILLING] Background Sesson Kick failed for ${pppoeUser}:`, err.message);
          });
      }).catch(e => {
        console.error(`[BILLING] Background MikroTik update failed for ${pppoeUser}:`, e.message);
      });
    }

    // ─── DYNAMIC BALANCE CALCULATION (For Receipts) ───
    let remainingBalance = 0;
    const dNowReceipt = new Date(); dNowReceipt.setHours(0,0,0,0);
    const dDueReceipt = new Date(finalDueDate);
    
    if (dDueReceipt > dNowReceipt) {
        remainingBalance = 0;
    } else {
        let monthsOwed = 0;
        let tempDate = new Date(dDueReceipt.getFullYear(), dDueReceipt.getMonth(), dDueReceipt.getDate());
        while (tempDate.getTime() <= dNowReceipt.getTime()) {
            monthsOwed++;
            tempDate.setMonth(tempDate.getMonth() + 1);
        }
        remainingBalance = (monthsOwed * monthlyRate) - currentWallet;
    }
    remainingBalance = Math.max(0, remainingBalance);

    // ─── BACKGROUND: Notifications (Email & SMS) ───
    const tReceipt = templates.paymentReceived(
      client.full_name,
      amount,
      payment_method,
      todayStr,
      client.account_id,
      finalDueDate,
      remainingBalance,
      currentWallet,
      monthlyRate
    );

    // Send Email
    if (client.email && client.email.includes('@')) {
      sendEmail(client.email, 'PAYMENT CONFIRMED', tReceipt.text, tReceipt.html).catch(e => {});
    }

    // Send SMS
    if (settings.enable_sms_receipts && client.contact) {
      sendSMS(client.contact, tReceipt.text, client.full_name);
      console.log(`[SMS-RECEIPT] Successfully queued receipt to ${client.contact}`);
    }

    // ─── BACKGROUND: Billing Audit Log ───
    db.prepare('INSERT INTO events(type, pppoe_user, caller_id, ip_address, timestamp) VALUES (?, ?, ?, ?, ?)').run(
      'PAYMENT_VERIFIED', client.pppoe_user, req.session?.admin?.username || 'System Admin',
      `Payment Recieved: P${amount}. New Due Date: ${formatDateMDY(finalDueDate)}`,
      new Date().toISOString()
    );

    db.prepare('INSERT INTO events(type, pppoe_user, caller_id, ip_address, timestamp) VALUES (?, ?, ?, ?, ?)').run(
      'RESTORATION', client.pppoe_user, req.session?.admin?.username || 'System Admin',
      `Service Restored: Plan [${client.plan}] pushed to MikroTik.`,
      new Date().toISOString()
    );

    // ─── INSTANT RESPONSE ───
    res.json({ success: true, payment: newPayment });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── MikroTik Sync ───
router.post('/sync-mikrotik', requireAdmin, async (req, res) => {
  try {
    console.log('🔄 MikroTik Sync: Fetching secrets from router...');
    const secrets = await mikrotik.getPPPoESecrets();
    console.log(`📡 MikroTik Sync: Received ${secrets.length} secrets from router.`);
    
    let imported = 0;
    let updated = 0;
    let skipped = 0;
    let errors = 0;

    // Profiles that indicate the client is suspended (throttled but not disabled on router)
    const SUSPENDED_PROFILES = ['unpaid', 'suspended', 'blocked', 'over due', 'overdue', 'non payment'];
    
    // Profiles that should NOT overwrite the real internet plan in the database
    const NON_PLAN_PROFILES = ['unpaid', 'suspended', 'blocked', 'over due', 'overdue', 'disabled', 'default', 'unpaid-profile', 'non payment'];

    for (const s of secrets) {
      try {
        // CLEAN UP: Remove any malformed prefixes (like :::) from the router name
        const cleanName = s.name.replace(/^[:| ]+/, '').trim();
        let existing = db.prepare('SELECT * FROM clients WHERE pppoe_user = ?').get(cleanName);
        
        // ✨ AUTO-LINK: If not found by username, try matching by Full Name (Comment)
        if (!existing && s.comment) {
          const nameFromComment = s.comment.split(' | ')[0].trim();
          existing = db.prepare('SELECT * FROM clients WHERE full_name = ?').get(nameFromComment);
          if (existing) {
            console.log(`🔗 Sync: Linking client [${nameFromComment}] to username [${cleanName}]`);
            db.prepare('UPDATE clients SET pppoe_user = ? WHERE id = ?').run(cleanName, existing.id);
          }
        }

        // Determine the correct status from the router:
        // - disabled checkbox on router = 'disabled'
        // - UNPAID/suspended/blocked profile = 'suspended' (throttled but technically enabled)
        // - anything else = 'active'
        const profileLower = String(s.profile || '').toLowerCase().trim();
        const isNonPlanProfile = NON_PLAN_PROFILES.includes(profileLower);
        const isSuspendedByProfile = SUSPENDED_PROFILES.includes(profileLower);
        const routerStatus = s.disabled ? 'disabled' : (isSuspendedByProfile ? 'suspended' : 'active');

        if (!existing) {
          // ─── NEW CLIENT: import from router ───
          console.log(`✨ Sync: Importing NEW client [${cleanName}] (Router Status: ${routerStatus}, Profile: ${s.profile})`);
          const lastClient = db.prepare('SELECT id FROM clients ORDER BY id DESC LIMIT 1').get();
          const nextId = lastClient ? lastClient.id + 1 : 1001;
          const accId = `ACC-${1000 + nextId}`;
          
          const rawName = s.comment || cleanName;
          const finalName = rawName.split(' | ')[0].trim();

          // For new clients, never import UNPAID as their plan — use 'default' instead
          const planToSave = isNonPlanProfile ? 'default' : (s.profile || 'default');
          
          // Look up the real price from the plans database instead of hardcoding 899
          const matchedPlan = db.data.plans ? db.data.plans.find(p => 
            p.id === planToSave || 
            p.mikrotik_profile === s.profile || 
            p.id.toUpperCase() === planToSave.toUpperCase()
          ) : null;
          const monthlyRateToSave = matchedPlan ? matchedPlan.price : 0;
          
          db.prepare(`
            INSERT INTO clients (
              account_id, full_name, address, contact, email, 
              pppoe_user, pppoe_pass, plan, monthly_rate, 
              vlan_id, olt_port, status, ip_address, mac_address, 
              signal_strength, installation_date, next_due_date, service
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            accId, finalName, '', '', '', 
            cleanName, String(s.password), planToSave, monthlyRateToSave,
            100, '1/1/1', routerStatus, '', '', '',
            '', // Installation Date
            '', // Next Due Date
            s.service || 'any'
          );
          imported++;

        } else {
          // ─── EXISTING CLIENT: update carefully ───
          console.log(`📝 Sync: Updating credentials for existing client [${cleanName}] (Router Status: ${routerStatus})`);
          
          // ✅ PROTECT real plan: only update plan if router shows a real plan (not UNPAID/suspended)
          const planToSave = isNonPlanProfile ? existing.plan : (s.profile || existing.plan);

          // ✅ PROTECT due date: never overwrite an existing due date
          const dueDateToSave = existing.next_due_date || '';

          db.prepare(`
            UPDATE clients SET 
              pppoe_user = ?, pppoe_pass = ?, plan = ?,
              status = ?, next_due_date = ?, service = ?
            WHERE id = ?
          `).run(
            cleanName,
            sanitizePassword(s.password || existing.pppoe_pass || ''),
            planToSave,
            routerStatus,     // ✅ Respect the actual disabled/enabled state from router
            dueDateToSave,    // ✅ Never wipe out existing due dates
            s.service || existing.service || 'any',
            existing.id
          );
          updated++;
        }
      } catch (itemErr) {
        console.error(`❌ Sync loop error for ${s.name}:`, itemErr.message);
        errors++;
      }
    }

    console.log(`✅ Sync Complete: ${imported} imported, ${updated} updated, ${skipped} skipped, ${errors} errors.`);

    // ─── PHASE 3: ACTIVE ENFORCEMENT ───
    // If the system says they are suspended, force the router to match.
    console.log('🛡️ MikroTik Sync: Performing Active Enforcement scan...');
    const shouldBeSuspended = db.prepare("SELECT pppoe_user FROM clients WHERE status IN ('suspended', 'disabled', 'unpaid')").all();
    const settings = db.prepare('SELECT unpaid_profile_name FROM settings LIMIT 1').get() || { unpaid_profile_name: 'unpaid' };
    const targetProfile = settings.unpaid_profile_name || 'unpaid';

    for (const c of shouldBeSuspended) {
      if (c.pppoe_user) {
        // Force suspension on MikroTik
        mikrotik.switchToUnpaid(c.pppoe_user, targetProfile).catch(() => {});
      }
    }

    res.json({ 
      success: true, 
      imported, 
      updated, 
      skipped, 
      errors,
      routerInfo: {
        host: mikrotik.host,
        identity: mikrotik.systemIdentity || 'Unknown MikroTik'
      }
    });
  } catch (err) {
    console.error('❌ Sync Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Push to MikroTik (Compare & Update) ───
router.get('/clients/:id/compare', requireAdmin, async (req, res) => {
  try {
    const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id);
    if (!client) return res.status(404).json({ error: 'Client not found in database' });

    const mtSecret = await mikrotik.getPPPoESecret(client.pppoe_user);
    
    res.json({
      success: true,
      local: {
        name: client.pppoe_user,
        password: client.pppoe_pass,
        profile: client.plan,
        service: client.service || 'pppoe'
      },
      mikrotik: mtSecret ? {
        name: mtSecret.name,
        password: mtSecret.password,
        profile: mtSecret.profile,
        service: mtSecret.service
      } : null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/clients/:id/push', requireAdmin, async (req, res) => {
  try {
    const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id);
    if (!client) return res.status(404).json({ error: 'Client not found' });

    console.log(`🚀 Pushing updates for [${client.pppoe_user}] to MikroTik...`);
    const activePlan = db.data.plans ? db.data.plans.find(p => p.id === client.plan || p.name === client.plan) : null;
    const mikrotikProfile = activePlan?.mikrotik_profile || (client.plan || '').toUpperCase();
    
    const success = await mikrotik.updatePPPoESecret(client.pppoe_user, {
      password: client.pppoe_pass,
      profile: mikrotikProfile,
      service: client.service || 'pppoe',
      comment: `${client.full_name} | Due: ${formatDateMDY(client.next_due_date)}`
    });

    if (success) {
      res.json({ success: true, message: 'Updated MikroTik successfully!' });
    } else {
      res.status(500).json({ error: 'Failed to update MikroTik' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Maintenance Utils ───

// ─── MikroTik Profiles ───
router.get('/mikrotik/profiles', requireAdmin, async (req, res) => {
  console.log(`[API] Admin requested MikroTik profiles (IP: ${req.ip})`);
  try {
    const profiles = await mikrotik.getPPPoEProfiles();
    res.json({ success: true, profiles });
  } catch (err) {
    console.error('[API ERROR] Failed to fetch MikroTik profiles:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/maintenance/email-backup', requireAdmin, async (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const dbPath = path.join(__dirname, '../data/isp_db.sqlite');
    const tempBackupPath = path.join(__dirname, '../data', `manual_backup_${Date.now()}.sqlite`);
    
    if (!fs.existsSync(dbPath)) {
      return res.status(404).json({ success: false, error: 'Database file not found.' });
    }

    // Copy to temp file for sending
    fs.copyFileSync(dbPath, tempBackupPath);

    // Triggering the manual backup email
    const settings = db.prepare('SELECT support_email FROM settings LIMIT 1').get() || {};
    const targetEmail = settings.support_email;

    if (!targetEmail) {
      return res.status(400).json({ success: false, error: 'No support email configured.' });
    }

    await sendEmail(
      targetEmail,
      `Manual ISP Backup - ${new Date().toLocaleString()}`,
      'Attached is your manual database backup request. Keep this file safe!',
      '<h3>Manual ISP Backup Request</h3><p>Attached is your manual database backup. You can use this file to restore your system if needed.</p>',
      [{ filename: 'manual_isp_backup.sqlite', path: tempBackupPath }]
    );

    // Safe cleanup
    setTimeout(() => {
      if (fs.existsSync(tempBackupPath)) fs.unlinkSync(tempBackupPath);
    }, 600000);

    res.json({ success: true, message: `Backup requested! Sending to ${targetEmail}...` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Communication Hub API Decommissioned

router.get('/maintenance/reboot', requireAdmin, (req, res) => {
  res.json({ success: true, message: 'Reboot available via POST' });
});

router.get('/maintenance/debug-clients', requireAdmin, (req, res) => {
  try {
    const clients = db.data.clients || db.clients || [];
    const payments = db.data.payments || db.payments || [];
    
    // Safety: only show first 2 for structure review
    res.json({ 
      count: clients.length, 
      sample: clients.slice(0, 2),
      paymentSample: payments.slice(0, 2)
    });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/maintenance/stats', requireAdmin, (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const dbPath = path.join(__dirname, '..', 'data', 'isp_db.sqlite');
    
    let dbSize = '0.00 KB';
    let lastBackup = 'N/A';
    
    if (fs.existsSync(dbPath)) {
      const stats = fs.statSync(dbPath);
      dbSize = (stats.size / 1024).toFixed(2) + ' KB';
      lastBackup = stats.mtime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    const uptime = process.uptime();
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);

    res.json({
      success: true,
      dbSize,
      lastBackup,
      ramUsage: (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2) + ' MB',
      uptime: `${hours}h ${minutes}m`,
      nodeVersion: process.version,
      platform: process.platform
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Settings Configuration (Branding & Policy) ───
router.get('/settings', requireAdmin, (req, res) => {
  try {
    const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get() || {};
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Verify Admin Password for Sensitive Operations ───
router.post('/verify-password', requireAdmin, (req, res) => {
  try {
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ error: 'Password is required' });
    }
    // Verify against the logged-in admin's actual password hash (bcrypt).
    // This removes the need for a hardcoded/shared gate password.
    const user = db.prepare('SELECT * FROM admin_users WHERE LOWER(username) = LOWER(?)').get(req.session.admin.username);
    if (!user) {
      return res.status(401).json({ error: 'Admin account not found.' });
    }
    if (!bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: 'Incorrect administrator password.' });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/settings', requireAdmin, (req, res) => {
  try {
    const fields = [
      'company_name', 'support_email', 'support_phone', 'admin_alert_email',
      'hero_title', 'hero_subtitle', 'hero_logo_url',
      'reminder_1_days', 'reminder_2_days', 'grace_period',
      'gcash_number', 'gcash_name', 'maya_number', 'maya_name', 'facebook_url',
      'gcash_qr_url', 'maya_qr_url', 'company_address', 'unpaid_profile_name',
      'sms_api_key', 'sms_sender_name', 'sms_gateway_type', 'sms_android_ip',
      'enable_sms_rem1', 'enable_sms_rem2', 'enable_sms_due_day', 'enable_sms_grace',
      'enable_sms_apps', 'enable_sms_broadcasts', 'enable_sms_receipts', 'enable_sms_alerts',
'enable_sms_billing', 'email_enabled', 'disable_mikrotik',
      'sms_receipt_template', 'sms_billing_reminder_template',
      'sms_due_today_template', 'sms_overdue_template',
      'sms_app_received_template', 'sms_app_approved_template',
      'sms_app_rejected_template', 'sms_welcome_template',
      // ─── Invoice Settings ───
      'invoice_auto', 'invoice_days_before', 'invoice_due_mode', 'invoice_due_day',
      'invoice_eom_due_day', 'invoice_billing_period', 'invoice_footer',
      // ─── Landing Page Settings ───
      'landing_theme', 'landing_tagline', 'landing_hero_text', 'landing_about_header',
      'landing_about_text', 'landing_about_bullets', 'landing_facebook', 'landing_youtube',
      'landing_tiktok', 'speedtest_enabled', 'speedtest_url', 'landing_accent',
      'landing_accent2', 'landing_hero1', 'landing_hero2', 'landing_hero3',
      // ─── Payment Gateway (Xendit) ───
      'payment_gateway', 'xendit_enabled', 'xendit_secret_key', 'xendit_webhook_token',
      // ─── MikroTik Router Settings ───
      'auto_isolate', 'isolate_days', 'isolate_action', 'billing_portal_subnet',
      'billing_portal_enabled', 'billing_portal_walled_garden',
      // ─── Custom Domain ───
      'custom_domain',
      // ─── GenieACS ───
      'genieacs_url', 'genieacs_user', 'genieacs_pass'
    ];

    const updates = [];
    const values = [];

    fields.forEach(f => {
      if (req.body[f] !== undefined) {
        updates.push(`${f} = ?`);
        let val = req.body[f];
        if (f.startsWith('enable_')) val = val ? 1 : 0;
        if (f === 'disable_mikrotik') val = val ? 1 : 0;
        if (f.endsWith('_days') || f === 'grace_period') val = parseInt(val) || 0;
        values.push(val);
      }
    });

    if (updates.length > 0) {
      const sql = `UPDATE settings SET ${updates.join(', ')} WHERE id = 1`;
      db.prepare(sql).run(...values);
    }

    console.log(`✅ [SETTINGS] Updated by ${req.session.admin?.username || 'admin'}`);
    // 🔄 Invalidate email transporter cache so new SMTP credentials apply immediately
    const { resetTransporter } = require('../utils/email');
    resetTransporter();
    res.json({ success: true, message: 'Settings saved successfully!' });
  } catch (err) {
    console.error('[SETTINGS] Save error:', err);
    res.status(500).json({ error: err.message });
  }
});



router.post('/maintenance/sms/test', requireAdmin, async (req, res) => {
  const { ip } = req.body;
  if (!ip) return res.status(400).json({ error: 'IP Address is required for testing.' });

  try {
    const baseUrl = ip.startsWith('http') ? ip : `http://${ip}`;

    // Android SMS Gateway app only responds to POST /send-sms.
    // We POST a dummy "PING" payload — the app will attempt to send it,
    // but any response (even an error) proves the gateway is reachable.
    const urlsToTry = ip.includes('/', 8)
      ? [baseUrl]
      : [`${baseUrl}/send-sms`, baseUrl];

    let success = false;
    let lastError = 'No response from gateway';

    for (const testUrl of urlsToTry) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(testUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: '09000000000', message: 'PING' }),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        // ANY HTTP response (200, 400, 404, 405...) means the gateway app is UP.
        // Only a network-level error (ECONNREFUSED, timeout) means it's truly offline.
        success = true;
        console.log(`[SMS-TEST] Gateway at ${testUrl} responded with HTTP ${response.status} — REACHABLE`);
        break;
      } catch (e) {
        lastError = e.name === 'AbortError' ? 'Connection timed out after 5 seconds' : e.message;
      }
    }

    if (success) {
      res.json({ success: true, message: 'Gateway is reachable! Your phone is connected and the SMS Gateway app is running.' });
    } else {
      res.status(503).json({
        error: 'Gateway Unreachable',
        detail: `Could not connect to ${baseUrl}. ${lastError}. Make sure your phone is on the same WiFi and the SMS Gateway app is open.`
      });
    }
  } catch (err) {
    res.status(500).json({ error: 'System Error', detail: err.message });
  }
});

router.get('/maintenance/sms/status', requireAdmin, async (req, res) => {
  const settings = db.prepare('SELECT sms_gateway_type, sms_android_ip FROM settings LIMIT 1').get() || {};
  const { sms_gateway_type, sms_android_ip } = settings;

  // ─── ANDROID STATUS (Local) ───
  if (sms_gateway_type !== 'android' || !sms_android_ip) {
    const qCount = db.prepare('SELECT count(*) as count FROM sms_queue WHERE status = ?').get('pending').count;
    return res.json({ status: 'inactive', type: sms_gateway_type, queueCount: qCount });
  }

  try {
    const baseUrl = sms_android_ip.startsWith('http') ? sms_android_ip : `http://${sms_android_ip}`;
    const urlsToTry = [baseUrl];
    if (!sms_android_ip.includes('/', 8)) urlsToTry.push(`${baseUrl}/send-sms`);

    let isOnline = false;
    for (const testUrl of urlsToTry) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2500); 

        const response = await fetch(testUrl, {
          method: 'GET',
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        if (response.ok || response.status === 404 || response.status === 405) {
          isOnline = true;
          break;
        }
      } catch (e) {}
    }

    const qCount = db.prepare('SELECT count(*) as count FROM sms_queue WHERE status = ?').get('pending').count;
    res.json({ 
      status: isOnline ? 'online' : 'offline', 
      type: 'android', 
      ip: sms_android_ip,
      queueCount: qCount 
    });
  } catch (err) {
    const qCount = db.prepare('SELECT count(*) as count FROM sms_queue WHERE status = ?').get('pending').count;
    res.json({ status: 'offline', type: 'android', error: err.message, queueCount: qCount });
  }
});

router.delete('/maintenance/sms/:id', requireAdmin, (req, res) => {
  try {
    db.prepare('DELETE FROM sms_queue WHERE id = ?').run(req.params.id);
    res.json({ success: true, message: 'Message removed from queue.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/maintenance/sms/clear-queue', requireAdmin, (req, res) => {
  try {
    db.prepare('DELETE FROM sms_queue').run();
    res.json({ success: true, message: 'SMS Queue cleared successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/maintenance/sms/queue/clear', requireAdmin, (req, res) => {
  try {
    db.prepare('DELETE FROM sms_queue').run();
    res.json({ success: true, message: 'SMS Queue cleared successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/maintenance/sms/logs', requireAdmin, (req, res) => {
  try {
    const logs = db.prepare(`
      SELECT * FROM sms_queue 
      ORDER BY id DESC 
      LIMIT 100
    `).all();
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 📢 Unified Maintenance Broadcast (SMS & Email)
 */
router.post('/maintenance/broadcast', requireAdmin, async (req, res) => {
  try {
    const { subject, message, target, useSms, useEmail } = req.body;
    if (!message) return res.status(400).json({ error: 'Message content is required.' });

    // 1. Fetch Target Clients
    let query = "SELECT full_name, contact, email FROM clients";
    if (target === 'active') {
      query += " WHERE status = 'active'";
    }
    const clients = db.prepare(query).all();

    if (clients.length === 0) {
      return res.status(404).json({ error: 'No clients found in the selected target group.' });
    }

    let smsQueued = 0;
    let emailSent = 0;

    // 4. Log the broadcast in history
    const bcResult = db.prepare(`
      INSERT INTO broadcasts (type, subject, message, target_group, recipients_count)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      (useSms && useEmail) ? 'SMS+EMAIL' : (useSms ? 'SMS' : 'EMAIL'),
      subject || 'Maintenance Notice',
      message,
      target,
      clients.length
    );
    const broadcastId = bcResult.lastInsertRowid;

    // 2. Process SMS Queue
    if (useSms) {
      const insertSms = db.prepare('INSERT INTO sms_queue (number, message, recipient_name, status, broadcast_id) VALUES (?, ?, ?, ?, ?)');
      const smsTransaction = db.transaction((list) => {
        for (const client of list) {
          if (client.contact) {
            // Personalize the message for each client
            // Supports {{name}} or (get_Name) - Case Insensitive
            const personalMsg = message.replace(/{{name}}|\(get_Name\)/gi, client.full_name || 'Valued Customer');
            insertSms.run(client.contact, personalMsg, client.full_name, 'pending', broadcastId);
            smsQueued++;
          }
        }
      });
      smsTransaction(clients);
    }

    // 3. Process Emails
    if (useEmail) {
      const { sendEmail } = require('../utils/email');
      const templates = require('../utils/emailTemplates');
      const emailSubject = subject || 'Important Service Update from ISP';

      process.nextTick(async () => {
        for (const client of clients) {
          if (client.email && client.email.includes('@')) {
            const personalMsg = message.replace(/{{name}}|\(get_Name\)/gi, client.full_name || 'Valued Customer');
            const template = templates.getBroadCastTemplate(client.full_name, personalMsg);
            await sendEmail(client.email, emailSubject, template.text, template.html, [], broadcastId);
          }
        }
      });
    }

    res.json({ 
      success: true, 
      message: `Broadcast initiated. SMS Queued: ${smsQueued}. Emails are being sent in the background.`,
      successCount: clients.length
    });

  } catch (err) {
    console.error('Broadcast Error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/system/broadcast/history', requireAdmin, (req, res) => {
  try {
    const history = db.prepare('SELECT * FROM broadcasts ORDER BY created_at DESC LIMIT 50').all();
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/system/broadcast/history/clear', requireAdmin, (req, res) => {
  try {
    db.prepare('DELETE FROM broadcasts').run();
    res.json({ success: true, message: 'Broadcast history cleared' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/maintenance/repair-dates', requireAdmin, (req, res) => {
  try {
    const today = new Date();
    const sixMonthsLimit = new Date();
    sixMonthsLimit.setMonth(sixMonthsLimit.getMonth() + 6);
    
    const limitStr = sixMonthsLimit.toISOString().split('T')[0];
    
    // 1. Find problematic clients
    const problematic = db.prepare("SELECT id, full_name, next_due_date FROM clients WHERE next_due_date > ?").all(limitStr);
    
    if (problematic.length === 0) {
      return res.json({ success: true, message: 'All client due dates are currently within a sane range. No repair needed.' });
    }

    // 2. Perform Repair (Reset to sane baseline: Current month anniversary)
    const todayStr = today.toISOString().split('T')[0];
    const repairStmt = db.prepare("UPDATE clients SET next_due_date = ? WHERE id = ?");
    
    const transaction = db.transaction((list) => {
      for (const c of list) {
        // We set them to 'today' and let the system calculate the NEXT month correctly
        // Or just reset them to today's date so they are due now.
        repairStmt.run(todayStr, c.id);
      }
    });

    transaction(problematic);

    res.json({ 
      success: true, 
      message: `Successfully repaired ${problematic.length} client(s) with Accurate anniversary resetting.`,
      fixed: problematic.length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/maintenance/reboot', requireAdmin, (req, res) => {
  res.json({ success: true, message: 'Admin Panel is refreshing. Please wait 3 seconds then reload your browser.' });
  setTimeout(() => {
    console.log('--- SOFT REFRESH TRIGGERED VIA MAINTENANCE ---');
    // Flush require() cache for hot-reload of routes and templates without killing the process
    Object.keys(require.cache).forEach(key => {
      // Only flush app-level modules, not node_modules
      if (!key.includes('node_modules')) {
        delete require.cache[key];
      }
    });
    console.log('✅ Module cache cleared. Server is still running.');
  }, 500);
});

router.post('/maintenance/clear-logs', requireAdmin, (req, res) => {
  try {
    db.prepare('DELETE FROM events').run();
    res.json({ success: true, message: 'Event logs cleared.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Backup & Restore ───
router.get('/backup', requireAdmin, (req, res) => {
  try {
    const backupData = db.getRawStore();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename=isp_backup_' + new Date().toISOString().split('T')[0] + '.json');
    res.send(JSON.stringify(backupData, null, 2));
  } catch (err) {
    res.status(500).json({ error: 'Backup failed: ' + err.message });
  }
});

router.post('/restore', requireAdmin, (req, res) => {
  try {
    const backupData = req.body;
    if (!backupData || typeof backupData !== 'object') {
      return res.status(400).json({ error: 'Invalid backup data' });
    }
    
    // Check for critical tables to ensure it's a valid backup
    if (!backupData.clients || !backupData.payments) {
      return res.status(400).json({ error: 'Incomplete backup data. Missing clients or payments.' });
    }

    const success = db.restoreData(backupData);
    if (success) {
      res.json({ success: true, message: 'Database restored successfully!' });
    } else {
      res.status(500).json({ error: 'Failed to restore database.' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Restore failed: ' + err.message });
  }
});

router.post('/restore-sqlite', requireAdmin, upload.single('backupFile'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded.' });
    }

    const tempPath = req.file.path;
    const dbPath = path.join(__dirname, '../data/isp_db.sqlite');

    console.warn(`[RESTORE] SQLite restoration initiated. Replacing ${dbPath} with ${tempPath}`);

    // 1. Close current connection to free the file handle
    db.close();

    // 2. Overwrite the database file
    fs.copyFileSync(tempPath, dbPath);

    // 3. Cleanup temp file
    fs.unlinkSync(tempPath);

    res.json({ success: true, message: 'Database replaced! System will restart now.' });

    // 4. Force a restart so the new DB is loaded fresh
    setTimeout(() => {
      console.log('🔄 [RESTORE] Restarting process to apply new database...');
      process.exit(0); 
    }, 1000);

  } catch (err) {
    console.error('[RESTORE-ERROR]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── System Automation ───
router.post('/system/run-billing-checks', requireAdmin, async (req, res) => {
  try {
    const adminName = req.session.admin?.username || 'Admin';
    logger.info(`🚀 [ADMIN API] Manual Billing Scan triggered by ${adminName}`);
    
    // Call the real utility logic
    const result = await runBillingChecks(adminName);
    
    if (result.success) {
        res.json({ success: true, message: `Billing scan complete. Scanned ${result.stats.scanned} clients.` });
    } else {
        res.status(500).json({ success: false, error: result.error });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Data Cleanup (One-time Repair) ───
router.post('/maintenance/cleanup-names', requireAdmin, (req, res) => {
  try {
    const clients = db.prepare('SELECT * FROM clients').all();
    let count = 0;
    clients.forEach(c => {
      if (c.full_name && c.full_name.includes(' | ')) {
        const clean = c.full_name.split(' | ')[0].trim();
        db.prepare('UPDATE clients SET full_name = ? WHERE id = ?').run(clean, c.id);
        count++;
      }
    });
    db.save();
    res.json({ success: true, message: `Successfully cleaned up ${count} client names.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── System Licensing (Decommissioned) ───
router.get('/system/license', requireAdmin, (req, res) => {
  res.json({
    success: true,
    machineId: 'MANUAL-LEDGER-MODE',
    status: 'ACTIVE (Standalone)',
    type: 'Permanent',
    expiry: null,
    maskedKey: 'STANDALONE-MODE'
  });
});

// ─── System Time (Live Calendar Sync) ───
router.get('/system/time', Object.assign((req, res) => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  
  res.json({
    success: true,
    iso: d.toISOString(),
    today: `${yyyy}-${mm}-${dd}`, // Standard YYYY-MM-DD
    display: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    timestamp: d.getTime()
  });
}, { requireAdmin: false })); // Allow session-check to hit this if needed

// ─── Dynamic Internet Plans Management ───
router.get('/plans/metrics', requireAdmin, (req, res) => {
  try {
    const plans = db.prepare('SELECT * FROM plans').all();
    const clients = db.prepare('SELECT plan, status FROM clients').all();
    
    const metrics = plans.map(p => {
      // Count clients on this plan (matching by ID or Name for legacy support)
      const clientCount = clients.filter(c => c.plan === p.id || c.plan === p.name).length;
      const activeCount = clients.filter(c => (c.plan === p.id || c.plan === p.name) && c.status === 'active').length;
      
      return {
        id: p.id,
        name: p.name,
        price: p.price,
        totalClients: clientCount,
        activeClients: activeCount,
        estimatedRevenue: activeCount * p.price
      };
    });

    const totalActiveClients = clients.filter(c => c.status === 'active').length;
    const totalEstimatedRevenue = metrics.reduce((sum, m) => sum + m.estimatedRevenue, 0);

    res.json({
      success: true,
      metrics,
      summary: {
        totalPlans: plans.length,
        totalActiveClients,
        totalEstimatedRevenue
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/plans', requireAdmin, (req, res) => {
  try {
    const plans = db.prepare('SELECT * FROM plans').all();
    res.json(plans);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/plans', requireAdmin, (req, res) => {
  try {
    const { id, name, speed, price, features, is_popular, mikrotik_profile } = req.body;
    if (!id || !name || !speed || !price) {
      return res.status(400).json({ error: 'ID, Name, Speed, and Price are required.' });
    }

    if (db.prepare('SELECT id FROM plans WHERE id = ?').get(id)) {
      return res.status(400).json({ error: 'A plan with this ID already exists.' });
    }
    
    // If setting a plan as popular, un-popularize others
    if (is_popular) {
      db.prepare('UPDATE plans SET is_popular = 0').run();
    }
    
    db.prepare(`
      INSERT INTO plans (id, name, speed, price, features, is_popular, mikrotik_profile)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, name, speed, Number(price), features || '', is_popular ? 1 : 0, mikrotik_profile || '');
    
    console.log(`✅ [PLANS] New plan added: ${name} (${id})`);
    res.json({ success: true, plans: db.prepare('SELECT * FROM plans').all() });
  } catch (err) {
    console.error('❌ [PLANS] Add Plan Error:', err.message);
    res.status(500).json({ error: 'Failed to add plan: ' + err.message });
  }
});

router.put('/plans/:id', requireAdmin, (req, res) => {
  try {
    const { name, speed, price, features, is_popular, mikrotik_profile } = req.body;
    const oldPlan = db.prepare('SELECT * FROM plans WHERE id = ?').get(req.params.id);
    
    if (!oldPlan) {
      return res.status(404).json({ error: 'Plan not found.' });
    }
    
    const oldPrice = oldPlan.price;
    const newPrice = price != null ? Number(price) : oldPrice;

    if (is_popular) {
      db.prepare('UPDATE plans SET is_popular = 0').run();
    }
    
    db.prepare(`
      UPDATE plans 
      SET name = ?, speed = ?, price = ?, features = ?, is_popular = ?, mikrotik_profile = ?
      WHERE id = ?
    `).run(
      name || oldPlan.name,
      speed || oldPlan.speed,
      newPrice,
      features != null ? features : oldPlan.features,
      is_popular ? 1 : 0,
      mikrotik_profile != null ? mikrotik_profile : oldPlan.mikrotik_profile,
      req.params.id
    );
    
    // ✅ CASCADE: Update all clients on this plan
    let cascaded = 0;
    if (newPrice !== oldPrice || oldPrice === 0) {
      const planId = req.params.id;
      const planName = oldPlan.name;
      
      const result = db.prepare(`
        UPDATE clients 
        SET monthly_rate = ?
        WHERE (plan = ? OR plan = ?)
          AND (monthly_rate = ? OR monthly_rate = 0 OR monthly_rate = 899)
      `).run(newPrice, planId, planName, oldPrice);
      
      cascaded = result.changes;
    }
    
    res.json({ success: true, plans: db.prepare('SELECT * FROM plans').all(), cascaded });
  } catch (err) {
    console.error('[PLANS UPDATE ERROR]', err);
    res.status(500).json({ error: 'Failed to update plan' });
  }
});

router.delete('/plans/:id', requireAdmin, (req, res) => {
  try {
    db.prepare('DELETE FROM plans WHERE id = ?').run(req.params.id);
    res.json({ success: true, plans: db.prepare('SELECT * FROM plans').all() });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete plan' });
  }
});

// ─── Payment Proof Review ───
router.get('/payment-proofs', requireAdmin, (req, res) => {
  try {
    const proofs = db.prepare('SELECT * FROM payment_proofs ORDER BY created_at DESC').all();
    res.json(proofs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/verify-proof', requireAdmin, async (req, res) => {
  try {
    const { id, status, adminNote, reDisable } = req.body;
    const proof = db.prepare('SELECT * FROM payment_proofs WHERE id = ?').get(id);
    if (!proof) return res.status(404).json({ error: 'Proof not found' });

    const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(proof.client_id);
    if (!client) return res.status(404).json({ error: 'Client associated with this proof no longer exists.' });

    // Update proof status
    db.prepare('UPDATE payment_proofs SET status = ?, admin_notes = ? WHERE id = ?')
      .run(status, adminNote || '', id);

    if (status === 'verified') {
       // AUTOMATED HEAVY LIFTING: Process the payment as if it was a manual entry
       // We'll reuse the logic from the manual payment POST route
       
       const todayStr = new Date().toISOString().split('T')[0];
       const previousDueDateSnapshot = client.next_due_date || client.installation_date || todayStr;
       
       // 🛡️ INTELLIGENT DATE GUARD: Apply same reset logic to Portal verifications
        const sixMonthsLimit = new Date(); sixMonthsLimit.setMonth(sixMonthsLimit.getMonth() + 6);
        const twelveMonthsAgo = new Date(); twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
        
        let safeBaseline = previousDueDateSnapshot;
        const dSnap = parseDateStrict(previousDueDateSnapshot);
        if (dSnap && (dSnap > sixMonthsLimit || dSnap < twelveMonthsAgo)) {
           console.log(`⚠️ [DATE-GUARD] Portal Legacy date ${previousDueDateSnapshot} detected for ${client.full_name}. Resetting baseline for accuracy.`);
           safeBaseline = todayStr;
        }

       const settings = db.prepare('SELECT * FROM settings LIMIT 1').get() || { grace_period: 3 };
       const graceDays = (settings.grace_period || 3);
       const dDueOrg = parseDateStrict(safeBaseline) || new Date();
       const isOverdue = new Date() > new Date(dDueOrg.getTime() + (graceDays * 24 * 60 * 60 * 1000));
       const isSuspended = isOverdue || (client.status && client.status.toLowerCase().includes('suspended'));

       // --- NEW SMART BILLING LOGIC (Sync with Manual Record) ---
       const activePlan = db.prepare('SELECT * FROM plans WHERE id = ? OR name = ? LIMIT 1').get(client.plan, client.plan);
       const monthlyRate = parseFloat(activePlan?.price) || parseFloat(client.monthly_rate) || 0;
       const paidAmount = parseFloat(proof.amount) || 0;
       
       let currentWallet = parseFloat(client.wallet_balance) || 0;
       currentWallet += paidAmount;
       
       let monthsToPay = 0;
       if (monthlyRate > 0) {
           while (currentWallet >= monthlyRate) {
               currentWallet -= monthlyRate;
               monthsToPay++;
           }
       } else {
           monthsToPay = 1; 
       }

       if (monthsToPay === 0) monthsToPay = 1;

       let newDueDate;
       if (isSuspended) {
         newDueDate = calculateNextDue(todayStr, null, true);
         if (monthsToPay > 1) {
           for(let i=1; i < monthsToPay; i++) {
              newDueDate = calculateNextDue(newDueDate, null, false);
           }
         }
       } else {
         newDueDate = previousDueDateSnapshot;
         for(let i=0; i < monthsToPay; i++) {
            newDueDate = calculateNextDue(newDueDate, client.installation_date, false);
         }
       }

       // 1. Record the payment
       db.prepare('INSERT INTO payments (client_id, amount, paid_date, due_date, payment_method, status, remarks, previous_due_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
         .run(client.id, proof.amount, todayStr, newDueDate, proof.method, 'paid', 'Verified from Portal: ' + (adminNote || ''), previousDueDateSnapshot);

       // 2. Update Client (Including Wallet)
       db.prepare("UPDATE clients SET next_due_date = ?, wallet_balance = ?, status = 'active' WHERE id = ?").run(newDueDate, currentWallet, client.id);

       // 3. MikroTik Restoration
       const pppoeUser = (client.pppoe_user || '').toString().trim();
       if (pppoeUser && pppoeUser.length >= 2) {
         const activePlan = db.prepare('SELECT * FROM plans WHERE id = ? OR name = ?').get(client.plan, client.plan);
         const mtProfile = activePlan?.mikrotik_profile || (client.plan || '').toUpperCase();
         mikrotik.updatePPPoESecret(pppoeUser, {
            password: client.pppoe_pass,
            profile: mtProfile,
            service: client.service || 'pppoe',
            disabled: 'no', // ✅ FORCE ENABLE
            comment: `${client.full_name} | Due: ${formatDateMDY(newDueDate)}`
         }).then(() => {
            // Kick them one more time to make sure they connect with the new speed profile
            mikrotik.reconnectUser(pppoeUser).catch(() => {});
         }).catch(e => console.error(`Restore failed for ${pppoeUser}:`, e.message));
       }

       // Calculate remaining balance
       const activePlanEmail = db.prepare('SELECT * FROM plans WHERE id = ? OR name = ?').get(client.plan, client.plan);
       const monthlyRateEmail = parseFloat(activePlanEmail?.price) || 0;
       
       const dNow = new Date(); dNow.setHours(0,0,0,0);
       const dDue = new Date(newDueDate);
       let remainingBalance = 0;
       if (dDue < dNow) {
           let monthsOwed = 0;
           let tempDate = new Date(dDue.getFullYear(), dDue.getMonth(), dDue.getDate());
           while (tempDate.getTime() <= dNow.getTime()) {
               monthsOwed++;
               tempDate.setMonth(tempDate.getMonth() + 1);
           }
           if (monthsOwed === 0) monthsOwed = 1;
           remainingBalance = (monthlyRateEmail * monthsOwed) - currentWallet;
       } else if (dDue <= new Date(dNow.getTime() + 7 * 24 * 60 * 60 * 1000)) {
           remainingBalance = monthlyRateEmail - currentWallet;
       }
       remainingBalance = Math.max(0, remainingBalance);
 
        // 4. Generate Professional Template
        const tReceipt = templates.paymentReceived(
          client.full_name, 
          proof.amount, 
          proof.method, 
          todayStr, 
          client.account_id, 
          newDueDate, 
          remainingBalance, 
          currentWallet, 
          monthlyRateEmail
        );

        // 5. Send Notifications
        if (client.email && client.email.includes('@')) {
          sendEmail(client.email, 'PAYMENT CONFIRMED', tReceipt.text, tReceipt.html).catch(e => {});
        }
        
        // Pairing SMS for Payment Confirmation (Structured/Professional)
        if (client.contact) {
          sendSMS(client.contact, tReceipt.text, client.full_name);
        }

       db.prepare('INSERT INTO events(type, pppoe_user, caller_id, ip_address, timestamp) VALUES (?, ?, ?, ?, ?)').run('PAYMENT_VERIFIED', client.pppoe_user, req.session.admin.username, `Approved ₱${proof.amount} via ${proof.method}`, new Date().toISOString());

       // 🧹 AUTO-RESOLUTION: Once a client is verified, cleanup all their other pending/rejected proofs
       // This makes them "disappear" from the active review area for both customer and admin.
       db.prepare("UPDATE payment_proofs SET status = 'archived' WHERE client_id = ? AND status IN ('pending_verification', 'rejected') AND id != ?")
         .run(client.id, id);

    } else if (status === 'rejected') {
       // Send Rejection Email
       if (client.email && client.email.includes('@')) {
          const emailContent = templates.paymentRejected(client.full_name, adminNote || 'The payment proof provided was invalid or could not be verified.');
          sendEmail(client.email, 'Payment Rejection Notice', emailContent.text, emailContent.html).catch(e => {});
       }
       
       db.prepare('INSERT INTO events(type, pppoe_user, caller_id, ip_address, timestamp) VALUES (?, ?, ?, ?, ?)').run('PAYMENT_REJECTED', client.pppoe_user, req.session.admin.username, `Rejected: ${adminNote || 'No reason provided'}`, new Date().toISOString());
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/tickets/:id', requireAdmin, (req, res) => {
  try {
    db.prepare('DELETE FROM support_tickets WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/summary/revenue', requireAdmin, async (req, res) => {
  try {
    const { period } = req.body; // 'daily', 'weekly', 'monthly'
    let filterDate = new Date();
    let periodName = 'Daily';

    if (period === 'weekly') {
      filterDate.setDate(filterDate.getDate() - 7);
      periodName = 'Weekly';
    } else if (period === 'monthly') {
      filterDate.setMonth(filterDate.getMonth() - 1);
      periodName = 'Monthly';
    } else {
      filterDate.setHours(0, 0, 0, 0); // Default to today
    }

    const payments = db.prepare('SELECT p.*, c.full_name FROM payments p JOIN clients c ON p.client_id = c.id').all();
    const filtered = payments.filter(p => p.status === 'paid' && new Date(p.created_at || p.paid_date) >= filterDate);

    const total = filtered.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    const methodCounts = {};
    filtered.forEach(p => {
      const m = p.payment_method || 'Other';
      methodCounts[m] = (methodCounts[m] || 0) + Number(p.amount);
    });

    const detailsHtml = Object.entries(methodCounts).map(([method, amount]) => `
      <tr style="border-bottom:1px solid #e1e8ef;">
        <td style="padding:8px 0;">${method}</td>
        <td style="padding:8px 0; text-align:right;">₱${amount.toLocaleString()}</td>
      </tr>
    `).join('');

    const settings = db.prepare('SELECT * FROM settings LIMIT 1').get();
    const adminEmail = settings?.admin_alert_email || settings?.support_email;

    if (adminEmail) {
      const emailContent = templates.revenueSummary(periodName, total, filtered.length, detailsHtml);
      await sendEmail(adminEmail, `${periodName} Revenue Snapshot`, emailContent.text, emailContent.html);
      res.json({ success: true, message: `Report sent to ${adminEmail}` });
    } else {
      res.status(400).json({ error: 'Admin alert email not configured in settings.' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 💓 System Heartbeat & Status
 */
router.get('/system/status', requireAdmin, (req, res) => {
  const settings = db.prepare('SELECT disable_mikrotik FROM settings WHERE id = 1').get() || {};
  res.json({
    version: '4.5.1 PRO',
    mikrotikDisabled: settings.disable_mikrotik === 1,
    mikrotik: {
      connected: mikrotik.connected,
      host: mikrotik.host,
      failedAttempts: mikrotik.failedAttempts,
      silenced: mikrotik.silenced
    },
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

/**
 * 🛠️ MikroTik Recovery / Update
 */
router.post('/system/mikrotik/update', requireAdmin, async (req, res) => {
  const { host, port, user, pass } = req.body;
  if (!host || !user) return res.status(400).json({ error: 'Host and User are required' });

  try {
    // 1. Update .env file
    updateEnvValue('MIKROTIK_HOST', host);
    if (port) updateEnvValue('MIKROTIK_PORT', port);
    updateEnvValue('MIKROTIK_USER', user);
    if (pass !== undefined) updateEnvValue('MIKROTIK_PASSWORD', pass);

    // 2. Trigger Reconnection (Forced to bypass any silence)
    console.log(`📡 Admin Route: Triggering FORCED reconnection to ${host}...`);
    const success = await mikrotik.connect(true);

    if (success) {
      res.json({ success: true, message: 'Settings saved and connection established!' });
    } else {
      res.status(400).json({ 
        error: 'Settings saved, but connection failed.', 
        detail: 'Check your MikroTik API settings and IP connectivity.' 
      });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to update system settings: ' + err.message });
  }
});

router.post('/system/mikrotik/discover-trigger', requireAdmin, (req, res) => {
  discovery.triggerDiscovery();
  res.json({ success: true });
});


// ─── Geographic Maintenance Broadcast (Selected Clients) ───
router.post('/broadcast/selected', requireAdmin, async (req, res) => {
  try {
    const { targets, message, subject, header } = req.body;
    if (!targets || !targets.length || !message) {
      return res.status(400).json({ error: 'Targets and message are required' });
    }

    // 🛡️ Log the broadcast in history first to get a broadcastId
    const bcResult = db.prepare(`
      INSERT INTO broadcasts (type, subject, message, target_group, recipients_count)
      VALUES (?, ?, ?, ?, ?)
    `).run('SELECTED_BROADCAST', subject || 'Maintenance Notice', message, 'selected', targets.length);
    const broadcastId = bcResult.lastInsertRowid;

    const { sendSMS } = require('../utils/sms');
    const { sendEmail } = require('../utils/email');
    
    const emailSubject = subject || 'NETWORK MAINTENANCE UPDATE';
    const emailHeader = header || 'NETWORK UPDATE';

    // Fetch Live Branding Settings
    const settings = db.prepare('SELECT support_email, support_phone, facebook_url FROM settings WHERE id = 1').get() || {};
    const supportEmail = settings.support_email || 'support@isp.com';
    const supportPhone = settings.support_phone || '09123456789';
    const facebookUrl = settings.facebook_url || '#';

    const today = new Date();
    today.setHours(0,0,0,0);

    const broadcastPromises = targets.flatMap(t => {
      const promises = [];
      const clientName = t.full_name || t.name || 'Valued Customer';
      
      // Fetch fresh client data including plan price and wallet for accurate balance
      const clientFull = db.prepare(`
        SELECT c.*, p.price as plan_price,
        (SELECT amount FROM payments WHERE client_id = c.id AND status = 'paid' ORDER BY paid_date DESC, id DESC LIMIT 1) as last_payment_amount
        FROM clients c 
        LEFT JOIN plans p ON LOWER(c.plan) = LOWER(p.name) OR LOWER(c.plan) = LOWER(p.id)
        WHERE c.id = ?
      `).get(t.id);

      // Calculate Days Overdue for THIS specific client
      let daysLate = 0;
      let amountDue = 0;
      let formattedAmount = '0.00';
      let months_owed = 1;
      const rawPlanPrice = clientFull ? (clientFull.plan_price || 0) : 0;
      const walletBal = clientFull ? (clientFull.wallet_balance || 0) : 0;
      
      // Defensive parsing for last payment (handling potential currency symbols or nulls)
      let lastPayRaw = clientFull ? clientFull.last_payment_amount : 0;
      if (typeof lastPayRaw === 'string') lastPayRaw = lastPayRaw.replace(/[^\d.]/g, '');
      const lastPayAmt = parseFloat(lastPayRaw) || 0;

      const planName = clientFull ? (clientFull.plan || 'Internet Service') : 'Internet Service';
      const fmt = (v) => {
          try {
              return Number(v || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
          } catch(e) { return '0.00'; }
      };

      if (clientFull && clientFull.next_due_date) {
        const dDue = new Date(clientFull.next_due_date + 'T00:00:00');
        const diffTime = today - dDue;
        daysLate = Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));

        // Calculate Dynamic Balance
        months_owed = 0;
        let tempDate = new Date(dDue.getFullYear(), dDue.getMonth(), dDue.getDate());
        const nowTime = today.getTime();
        
        while (tempDate.getTime() <= nowTime) {
            months_owed++;
            tempDate.setMonth(tempDate.getMonth() + 1);
        }
        
        // If it's a current reminder (not yet overdue but due today)
        if (months_owed === 0) months_owed = 1;

        amountDue = (months_owed * rawPlanPrice) - walletBal;
        if (amountDue < 0) amountDue = 0;
        formattedAmount = fmt(amountDue);
      }

      // Build breakdown line
      let breakdownLine = '';
      if (amountDue <= 0) {
          breakdownLine = '(Fully Paid - Thank you!)';
      } else if (walletBal > 0 && months_owed > 1) {
          breakdownLine = `(${months_owed} x P${fmt(rawPlanPrice)} - P${fmt(walletBal)} credit)`;
      } else if (walletBal > 0) {
          breakdownLine = `(P${fmt(rawPlanPrice)} - P${fmt(walletBal)} credit)`;
      } else if (months_owed > 1) {
          breakdownLine = `(${months_owed} x P${fmt(rawPlanPrice)})`;
      }
      const creditLine = walletBal > 0 ? `\nLAST PAYMENT: P${fmt(walletBal)}` : '';

      const dueDate = clientFull && clientFull.next_due_date ? new Date(clientFull.next_due_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase() : 'N/A';
      
      const settings = db.prepare('SELECT * FROM settings LIMIT 1').get() || {};
      const companyName = settings.company_name || "SJKM NETWORK DATA LINK";
      
      // Dynamic Template Overrides
      let actualTemplate = message;
      if (subject && subject.includes('Overdue Reminder') && settings.sms_overdue_template) {
          actualTemplate = settings.sms_overdue_template;
      }

       let personalMsg = actualTemplate.replace(/{{name}}|\(get_Name\)/gi, clientName);
       // Support both overdue and billing template placeholder formats
       personalMsg = personalMsg.replace(/{{amount}}/gi, formattedAmount);
       personalMsg = personalMsg.replace(/{{amount_due}}/gi, formattedAmount);
       personalMsg = personalMsg.replace(/{{due_date}}/gi, dueDate);
       personalMsg = personalMsg.replace(/{{date}}/gi, dueDate);
       const statusHeader = (daysLate > 0) ? 'OVERDUE NOTICE' : 'PAYMENT REMINDER';
       personalMsg = personalMsg.replace(/{{status}}/gi, statusHeader);
       personalMsg = personalMsg.replace(/{{status_header}}/gi, statusHeader);
       
       personalMsg = personalMsg.replace(/{{days_late}}/gi, daysLate);
       personalMsg = personalMsg.replace(/{{plan_name}}/gi, planName);
       personalMsg = personalMsg.replace(/{{plan_price}}/gi, fmt(rawPlanPrice));
       personalMsg = personalMsg.replace(/{{months_unpaid}}/gi, months_owed);
       personalMsg = personalMsg.replace(/{{breakdown}}/gi, breakdownLine);
       personalMsg = personalMsg.replace(/{{credit}}/gi, creditLine);
       personalMsg = personalMsg.replace(/{{last_payment\s*}}/gi, lastPayAmt > 0 ? `P${fmt(lastPayAmt)}` : 'None');
       personalMsg = personalMsg.replace(/{{support_email}}/gi, supportEmail);
       personalMsg = personalMsg.replace(/{{support_phone}}/gi, supportPhone);
       personalMsg = personalMsg.replace(/{{facebook_url}}/gi, facebookUrl);
      
      // Separate SMS (Branded) from Email (Clean)
      // Strip company name from personalMsg if it's there (to keep Email clean)
      let emailCleanMsg = personalMsg;
      const msgStartsWithCompany = personalMsg.toLowerCase().startsWith(companyName.toLowerCase());
      if (msgStartsWithCompany) {
        emailCleanMsg = personalMsg.slice(companyName.length).trim();
      }

      const smsBrandedMsg = msgStartsWithCompany ? personalMsg : `${companyName}\n\n` + personalMsg;
      const cleanEmailSubject = emailSubject.replace(/Bulk /gi, '');
      
      let htmlPersonalMsg = emailCleanMsg;
      if (facebookUrl) {
        // Find the line that looks like FB: [URL] or similar and replace with a clean link
        // We'll also remove the informal "Need Help?" lines if they were part of the template message
        htmlPersonalMsg = htmlPersonalMsg.replace(/📞 Need Help\?|Need Help\?|Phone:.*|Email:.*|FB: .*/gi, '').trim();
      }

      // Color-code key billing lines for professional look
      htmlPersonalMsg = htmlPersonalMsg
        .replace(/(\d+ DAYS OVERDUE)/gi, '<span style="color:#ef4444; font-weight:800;">$1</span>')
        .replace(/(PLAN:.*)/gi, '<span style="color:#3b82f6; font-weight:700;">$1</span>')
        .replace(/(TOTAL DUE:.*)/gi, '<span style="color:#ef4444; font-weight:800; font-size:17px;">$1</span>')
        .replace(/(LAST PAYMENT:.*)/gi, '<span style="color:#10b981; font-weight:700;">$1</span>')
        .replace(/(MONTHS UNPAID:.*)/gi, '<span style="color:#f59e0b; font-weight:700;">$1</span>');

      if (t.contact) {
        const { queueSMS } = require('../utils/sms');
        queueSMS(t.contact, smsBrandedMsg, clientName, broadcastId);
      }
      if (t.email && t.email.includes('@')) {
        let finalHtmlContent = `
          <div style="font-family:sans-serif; padding:20px; color:#1e293b;">
            <h2 style="color:#ef4444; text-transform: uppercase;">${emailHeader}</h2>
            <div style="white-space: pre-wrap; margin-bottom: 20px; line-height: 1.8; font-size: 15px;">${htmlPersonalMsg}</div>
            
            <div style="margin-top: 32px; padding-top: 20px; border-top: 1px solid #e2e8f0;">
              <p style="font-size: 14px; color: #475569; margin-bottom: 15px; font-weight: 600;">If you have any concerns, please CONTACT US:</p>
              <table style="width: 100%; max-width: 400px; font-size: 13px; color: #64748b; border-collapse: collapse;">
                <tr>
                  <td style="padding: 4px 0; width: 100px;"><strong>Email:</strong></td>
                  <td style="padding: 4px 0;"><a href="mailto:${supportEmail}" style="color: #3b82f6; text-decoration: none;">${supportEmail}</a></td>
                </tr>
                <tr>
                  <td style="padding: 4px 0;"><strong>Phone No.:</strong></td>
                  <td style="padding: 4px 0; color: #1e293b;">${supportPhone}</td>
                </tr>
                <tr>
                  <td style="padding: 4px 0;"><strong>Facebook:</strong></td>
                  <td style="padding: 4px 0;"><a href="${facebookUrl}" style="color: #3b82f6; text-decoration: none;">Visit Link</a></td>
                </tr>
              </table>
            </div>
            
            <hr style="border:none; border-top:1px solid #f1f5f9; margin:30px 0;">
            <small style="color:#94a3b8; font-size: 11px;">This is an automated notification from your internet service provider.</small>
          </div>
        `;

        if (message.includes('{{days_late}} DAYS OVERDUE')) {
            const daysLeft = -daysLate;
            const dueDateStr = clientFull && clientFull.next_due_date ? clientFull.next_due_date : 'N/A';
            const tEmail = templates.billingReminder(clientName, amountDue, dueDateStr, clientFull ? clientFull.account_id : t.id, daysLeft, lastPayAmt, planName, rawPlanPrice, months_owed, walletBal);
            finalHtmlContent = tEmail.html;
            emailCleanMsg = tEmail.text;
        }

        promises.push(sendEmail(t.email, cleanEmailSubject, emailCleanMsg, finalHtmlContent, [], broadcastId));
      }
      return promises;
    });

    // 🚀 SPEED OPTIMIZATION: Respond to the user immediately and process sending in the background
    res.json({ success: true, message: 'Broadcast initiated successfully.', successCount: targets.length });

    // Background Dispatch
    (async () => {
        try {
            const results = await Promise.allSettled(broadcastPromises);
            const totalSent = results.filter(r => r.status === 'fulfilled').length;
            
            // 📝 LOG: Broadcast Activity
            const isSingle = targets.length === 1;
            const logAction = isSingle ? 'Individual Reminder Sent' : 'Mass Broadcast Sent';
            logActivity('Reminder', logAction, {
                subject: emailSubject,
                recipients: targets.length,
                deliveries: totalSent,
                header: emailHeader,
                target_name: isSingle ? (targets[0].full_name || targets[0].name || 'Client') : 'Multiple'
            }, 'System Admin', isSingle ? (targets[0].id || null) : null);

            console.log(`[BROADCAST-BG] Finished. Deliveries: ${totalSent}/${broadcastPromises.length}`);
        } catch (bgErr) {
            console.error('[BROADCAST-BG] Error:', bgErr.message);
        }
    })();
    return; // Already responded
  } catch (err) {
    console.error('[BROADCAST] Critical error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── COVERAGE ZONE MANAGEMENT ───

// List all coverage zones
router.get('/coverage-zones', requireAdmin, (req, res) => {
  try {
    const zones = db.prepare('SELECT * FROM coverage_zones ORDER BY created_at DESC').all();
    res.json(zones.map(z => ({
      ...z,
      coordinates: z.coordinates ? JSON.parse(z.coordinates) : []
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create a new coverage zone
router.post('/coverage-zones', requireAdmin, (req, res) => {
  try {
    const { name, type, coordinates, center_lat, center_lng, radius, color } = req.body;
    
    if (type === 'polygon' && (!coordinates || coordinates.length < 3)) {
      return res.status(400).json({ error: 'A polygon requires at least 3 points.' });
    }
    if (type === 'circle' && (!center_lat || !center_lng || !radius)) {
      return res.status(400).json({ error: 'A circle requires center coordinates and radius.' });
    }

    const result = db.prepare(`
      INSERT INTO coverage_zones (name, type, coordinates, center_lat, center_lng, radius, color, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    `).run(
      name || 'Service Area',
      type || 'polygon',
      coordinates ? JSON.stringify(coordinates) : null,
      center_lat || null,
      center_lng || null,
      radius || null,
      color || '#6366f1'
    );

    console.log(`📍 [COVERAGE] New zone created: "${name || 'Service Area'}" (${type})`);
    res.status(201).json({ success: true, id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update a coverage zone
router.put('/coverage-zones/:id', requireAdmin, (req, res) => {
  try {
    const { name, coordinates, center_lat, center_lng, radius, color, is_active } = req.body;
    
    const updates = [];
    const params = [];
    
    if (name !== undefined) { updates.push('name = ?'); params.push(name); }
    if (coordinates !== undefined) { updates.push('coordinates = ?'); params.push(JSON.stringify(coordinates)); }
    if (center_lat !== undefined) { updates.push('center_lat = ?'); params.push(center_lat); }
    if (center_lng !== undefined) { updates.push('center_lng = ?'); params.push(center_lng); }
    if (radius !== undefined) { updates.push('radius = ?'); params.push(radius); }
    if (color !== undefined) { updates.push('color = ?'); params.push(color); }
    if (is_active !== undefined) { updates.push('is_active = ?'); params.push(is_active ? 1 : 0); }

    if (updates.length === 0) return res.json({ success: true });
    
    params.push(req.params.id);
    db.prepare(`UPDATE coverage_zones SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a coverage zone
router.delete('/coverage-zones/:id', requireAdmin, (req, res) => {
  try {
    db.prepare('DELETE FROM coverage_zones WHERE id = ?').run(req.params.id);
    console.log(`🗑️ [COVERAGE] Zone #${req.params.id} deleted.`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ─── Company Expenses ───
router.get('/expenses', requireAdmin, (req, res) => {
  try {
    const { month, year } = req.query;
    let query = 'SELECT * FROM expenses';
    const params = [];

    if (year && year !== 'all') {
      if (month && month !== 'all') {
        query += ' WHERE date LIKE ?';
        params.push(`${year}-${month}%`);
      } else {
        query += ' WHERE date LIKE ?';
        params.push(`${year}-%`);
      }
    }

    query += ' ORDER BY date DESC, id DESC';
    const expenses = db.prepare(query).all(...params);
    res.json(expenses);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/expenses', requireAdmin, (req, res) => {
  const { category, description, amount, date, vendor, payment_method, status } = req.body;
  if (!category || !amount || !date) return res.status(400).json({ error: 'Category, amount, and date are required.' });
  
  try {
    const result = db.prepare('INSERT INTO expenses (category, description, amount, date, vendor, payment_method, status) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      category, 
      description, 
      amount, 
      date,
      vendor || '',
      payment_method || 'Cash',
      status || 'Paid'
    );
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/expenses/:id', requireAdmin, (req, res) => {
  try {
    db.prepare('DELETE FROM expenses WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/expenses/:id/status', requireAdmin, (req, res) => {
  try {
    const { status } = req.body;
    db.prepare('UPDATE expenses SET status = ? WHERE id = ?').run(status, req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// ─── Installations Management ───
router.get('/installations', requireAdmin, (req, res) => {
  try {
    const clients = db.prepare("SELECT id, full_name, account_id, plan, status FROM clients WHERE status != 'deleted'").all() || [];
    const installs = db.prepare('SELECT * FROM installations').all() || [];
    const installMap = {};
    installs.forEach(i => {
      if (i && i.client_id) installMap[i.client_id] = i;
    });
    
    const results = clients.map(c => {
       const rec = installMap[c.id] || { amount_due: 0, amount_paid: 0, remarks: '', paid_date: null };
       return {
         id: c.id,
         account_id: c.account_id,
         full_name: c.full_name,
         plan: c.plan,
         client_status: c.status,
         amount_due: rec.amount_due || 0,
         amount_paid: rec.amount_paid || 0,
         paid_date: rec.paid_date,
         balance: Math.max(0, (rec.amount_due || 0) - (rec.amount_paid || 0)),
         status: (rec.amount_due === 0 || (rec.amount_due > 0 && rec.amount_paid >= rec.amount_due)) ? 'Paid' : (rec.amount_paid > 0 ? 'Partial' : 'Pending'),
         remarks: rec.remarks || ''
       };
    });
    res.json(results);
  } catch (err) {
    logger.error(`[INSTALLATIONS-API] Error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

router.post('/installations/update', requireAdmin, (req, res) => {
  try {
     const { client_id, amount_due, amount_paid, remarks, paid_date } = req.body;
     const existing = db.prepare('SELECT * FROM installations WHERE client_id = ?').get(client_id);
     
     let newStatus = 'Pending';
     if (amount_due === 0 || (amount_due > 0 && amount_paid >= amount_due)) newStatus = 'Paid';
     else if (amount_paid > 0) newStatus = 'Partial';
     
     if (existing) {
       db.prepare('UPDATE installations SET amount_due = ?, amount_paid = ?, status = ?, remarks = ?, paid_date = ?, updated_at = CURRENT_TIMESTAMP WHERE client_id = ?')
         .run(amount_due, amount_paid, newStatus, remarks || '', paid_date || null, client_id);
     } else {
       db.prepare('INSERT INTO installations (client_id, amount_due, amount_paid, status, remarks, paid_date) VALUES (?, ?, ?, ?, ?, ?)')
         .run(client_id, amount_due, amount_paid, newStatus, remarks || '', paid_date || null);
     }
     res.json({ success: true });
  } catch(e) {
     res.status(500).json({ error: e.message });
  }
});

// ─── Sales Monitoring & Billing ───
router.get('/sales/summary', requireAdmin, (req, res) => {
  try {
    const period = req.query.period || 'monthly';
    const selectedYear = req.query.year || new Date().getFullYear().toString();
    let query = '';
    
    if (period === 'daily') {
      query = `
        SELECT SUBSTR(p.paid_date, 1, 10) as label, SUM(p.amount) as total 
        FROM payments p
        INNER JOIN clients c ON p.client_id = c.id
        WHERE p.status = 'paid' AND SUBSTR(p.paid_date, 1, 4) = ?
        GROUP BY label ORDER BY label DESC LIMIT 30
      `;
    } else {
      query = `
        SELECT SUBSTR(p.paid_date, 1, 7) as label, SUM(p.amount) as total 
        FROM payments p
        INNER JOIN clients c ON p.client_id = c.id
        WHERE p.status = 'paid' AND SUBSTR(p.paid_date, 1, 4) = ?
        GROUP BY label ORDER BY label ASC
      `;
    }
    
    const sales = db.prepare(query).all(selectedYear);
    const subRes = db.prepare(`
      SELECT SUM(p.amount) as total 
      FROM payments p 
      INNER JOIN clients c ON p.client_id = c.id 
      WHERE p.status = 'paid' AND SUBSTR(p.paid_date, 1, 4) = ?
    `).get(selectedYear);
    const totalSubscriptionRevenue = (subRes && subRes.total) || 0;
    
    const instRes = db.prepare(`
      SELECT SUM(i.amount_paid) as total 
      FROM installations i
      INNER JOIN clients c ON i.client_id = c.id
      WHERE SUBSTR(i.paid_date, 1, 4) = ?
    `).get(selectedYear);
    const totalInstallRevenue = (instRes && instRes.total) || 0;
    
    // Do NOT add Installation Revenue here (User requested exclusion from Sales Dashboard)
    const totalRevenue = Number(totalSubscriptionRevenue);

    const totalExpenses = db.prepare("SELECT SUM(amount) as total FROM expenses").get().total || 0;
    
    // Advanced Stats
    const totalClients = db.prepare("SELECT COUNT(*) as count FROM clients WHERE status != 'deleted'").get().count;
    const monthlyTarget = db.prepare(`
      SELECT SUM(CAST(p.price AS REAL)) as total 
      FROM clients c 
      LEFT JOIN plans p ON LOWER(c.plan) = LOWER(p.name) OR LOWER(c.plan) = LOWER(p.id)
      WHERE c.status NOT IN ('deleted', 'disconnected')
    `).get().total || 0;
    
    const d = new Date();
    const today = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const currentMonthEnd = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    
    // Efficiency based on ACTUAL CASH COLLECTIONS this month
    let targetMonth = today.substring(0, 7);
    const realizedMonthSubscription = db.prepare(`
      SELECT SUM(p.amount) as total 
      FROM payments p 
      INNER JOIN clients c ON p.client_id = c.id 
      WHERE p.status = 'paid' AND SUBSTR(p.paid_date, 1, 7) = ?
    `).get(targetMonth).total || 0;
    
    // Efficiency calculation (subscriptions only vs target)
    const efficiencyVal = monthlyTarget > 0 ? (Number(realizedMonthSubscription) / Number(monthlyTarget)) * 100 : 0;
    const remainingToCollect = Math.max(Number(monthlyTarget) - Number(realizedMonthSubscription), 0);
    
    // Keep actual cash collections for the chart/stats
    targetMonth = req.query.month && req.query.month !== 'all' ? `${selectedYear}-${req.query.month}` : today.substring(0, 7);
    const monthSubscriptionRevenue = db.prepare(`
      SELECT SUM(p.amount) as total 
      FROM payments p 
      INNER JOIN clients c ON p.client_id = c.id 
      WHERE p.status = 'paid' AND SUBSTR(p.paid_date, 1, 7) = ?
    `).get(targetMonth).total || 0;

    const monthInstallRevenue = db.prepare(`
        SELECT SUM(i.amount_paid) as total 
        FROM installations i
        INNER JOIN clients c ON i.client_id = c.id
        WHERE SUBSTR(i.paid_date, 1, 7) = ?
    `).get(targetMonth).total || 0;

    const monthCashCollection = Number(monthSubscriptionRevenue) + Number(monthInstallRevenue);
    
    const d7 = new Date();
    d7.setDate(d7.getDate() + 7);
    const sevenDaysStr = d7.getFullYear() + '-' + String(d7.getMonth() + 1).padStart(2, '0') + '-' + String(d7.getDate()).padStart(2, '0');

    const overdueCount = db.prepare("SELECT COUNT(*) as count FROM clients WHERE next_due_date < ? AND status NOT IN ('deleted', 'disconnected')").get(today).count;
    const pendingProofsCount = db.prepare("SELECT COUNT(*) as count FROM payment_proofs WHERE status = 'pending_verification'").get().count;
    
    // Count clients with Partial Collections (Wallet > 0 and Due Today or Overdue)
    const partialCollectionsCount = db.prepare(`
      SELECT COUNT(*) as count FROM clients 
      WHERE status NOT IN ('deleted', 'disconnected') 
      AND (wallet_balance > 0) 
      AND next_due_date <= ?
    `).get(today).count;

    const pendingCount = pendingProofsCount + partialCollectionsCount;

    const dueSoonCount = db.prepare("SELECT COUNT(*) as count FROM clients WHERE next_due_date >= ? AND next_due_date <= ? AND status NOT IN ('deleted', 'disconnected')").get(today, sevenDaysStr).count;
    const disconnectedCount = db.prepare("SELECT COUNT(*) as count FROM clients WHERE status = 'disconnected'").get().count;

    const arpuVal = totalClients > 0 ? (Number(monthlyTarget) / Number(totalClients)) : 0;

    const recentPayments = db.prepare(`
      SELECT p.*, c.full_name 
      FROM payments p 
      JOIN clients c ON p.client_id = c.id 
      ORDER BY p.created_at DESC LIMIT 5
    `).all();

    res.json({
      sales,
      totalRevenue: Number(totalRevenue),
      totalSubscriptionRevenue: Number(totalSubscriptionRevenue),
      totalInstallRevenue: Number(totalInstallRevenue),
      totalExpenses: Number(totalExpenses),
      netProfit: Number(totalRevenue) - Number(totalExpenses),
      monthCollection: Number(monthSubscriptionRevenue),
      monthCashCollection: Number(monthCashCollection),
      monthSubscriptionRevenue: Number(monthSubscriptionRevenue),
      monthInstallRevenue: Number(monthInstallRevenue),
      recentPayments,
      stats: {
        totalClients: Number(totalClients),
        monthlyTarget: Number(monthlyTarget),
        overdueCount: Number(overdueCount),
        pendingCount: Number(pendingCount),
        pendingProofsCount: Number(pendingProofsCount),
        dueSoonCount: Number(dueSoonCount),
        disconnectedCount: Number(disconnectedCount),
        remainingToCollect: Number(remainingToCollect),
        arpu: arpuVal,
        collectionEfficiency: efficiencyVal
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/sales/soa', requireAdmin, (req, res) => {
  try {
    const clients = db.prepare(`
      SELECT c.*, 
        p_plan.price as plan_price,
        (SELECT SUM(CAST(REPLACE(REPLACE(amount, ',', ''), '₱', '') AS REAL)) FROM payments WHERE client_id = c.id AND status = 'paid') as total_paid,
        (SELECT paid_date FROM payments WHERE client_id = c.id AND status = 'paid' ORDER BY paid_date DESC LIMIT 1) as last_payment_date,
        (SELECT amount FROM payments WHERE client_id = c.id AND status = 'paid' ORDER BY paid_date DESC, id DESC LIMIT 1) as last_payment_amount,
        (SELECT payment_method FROM payments WHERE client_id = c.id AND status = 'paid' ORDER BY paid_date DESC LIMIT 1) as payment_method,
        (SELECT remarks FROM payments WHERE client_id = c.id AND status = 'paid' ORDER BY paid_date DESC LIMIT 1) as last_payment_remarks
      FROM clients c 
      LEFT JOIN plans p_plan ON LOWER(c.plan) = LOWER(p_plan.name) OR LOWER(c.plan) = LOWER(p_plan.id)
      WHERE c.status != 'deleted'
      ORDER BY c.next_due_date ASC
    `).all();
    res.json(clients);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/sales/ledger', requireAdmin, (req, res) => {
  try {
    const ledger = db.prepare(`
      SELECT 
        'Payment' as type,
        p.id, 
        p.amount, 
        p.paid_date, 
        p.created_at, 
        p.payment_method,
        c.full_name, 
        c.account_id 
      FROM payments p 
      INNER JOIN clients c ON p.client_id = c.id 
      WHERE p.status = 'paid'
      ORDER BY p.paid_date DESC, p.created_at DESC
    `).all();
    res.json(ledger);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/clients/restore-fresh', requireAdmin, (req, res) => {
  const { client_id } = req.body;
  if (!client_id) return res.status(400).json({ error: 'Client ID is required.' });

  try {
    const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(client_id);
    if (!client) return res.status(404).json({ error: 'Client not found.' });

    // Calculate new due date (1 month from today)
    const nextDate = new Date();
    nextDate.setMonth(nextDate.getMonth() + 1);
    const nextDateStr = nextDate.toISOString().split('T')[0];

    // Update client
    db.prepare("UPDATE clients SET next_due_date = ?, status = 'active', remarks = ? WHERE id = ?")
      .run(nextDateStr, (client.remarks || '') + ` [RESTORED FRESH ON ${new Date().toLocaleDateString()}]`, client_id);

    // Optional: Mark all previous unpaid periods as 'waived' in payments table if needed
    // For now, resetting the next_due_date is enough to stop the 'Overdue' calculation

    console.log(`ðŸ”„ [CLIENTS] ${client.full_name} restored fresh. Next due: ${nextDateStr}`);
    res.json({ success: true, message: 'Client restored and billing cycle reset to next month.' });
  } catch (err) {
    console.error('Restore Error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/payments/client/:id', requireAdmin, (req, res) => {
  try {
    const payments = db.prepare('SELECT * FROM payments WHERE client_id = ? ORDER BY created_at DESC').all(req.params.id);
    res.json(payments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 💰 NEW: Robust Payment Voiding (Unified with DELETE /payments/:id)

router.post('/payments/void', requireAdmin, async (req, res) => {
  const { payment_id } = req.body;
  if (!payment_id) return res.status(400).json({ error: 'Payment ID is required.' });

  try {
    const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(payment_id);
    if (!payment) return res.status(404).json({ error: 'Payment record not found.' });

    const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(payment.client_id);
    if (!client) return res.status(404).json({ error: 'Client associated with this payment no longer exists.' });

    // 1. Delete the payment record (Cleanup ledger)
    db.prepare("DELETE FROM payments WHERE id = ?").run(payment_id);

    // 2. Revert client next_due_date to EXACTLY what it was before this payment
    const revertedDateStr = payment.previous_due_date;
    if (!revertedDateStr) throw new Error('Cannot revert: Previous due date not found in record.');

    // 📝 LOG: Payment Voided
    logActivity('Billing', 'Payment Voided', {
      payment_id: payment_id,
      amount: payment.amount,
      client_name: client.full_name,
      original_due_date: payment.due_date
    }, 'System Admin', client.id);

    // Calculate how many months the due date was advanced by this payment
    let monthsAdvanced = 0;
    if (payment.due_date && payment.previous_due_date && payment.due_date !== payment.previous_due_date) {
      let temp = new Date(payment.previous_due_date + 'T12:00:00');
      const target = new Date(payment.due_date + 'T12:00:00');
      while (temp < target) {
        temp.setMonth(temp.getMonth() + 1);
        monthsAdvanced++;
      }
    }

    // Determine the monthly rate to reverse the wallet balance
    const activePlan = db.prepare('SELECT price FROM plans WHERE LOWER(name) = LOWER(?) OR LOWER(id) = LOWER(?)').get(client.plan, client.plan);
    const monthlyRate = parseFloat(activePlan?.price) || 0;
    const paymentAmount = parseFloat(payment.amount) || 0;

    let newWallet = (parseFloat(client.wallet_balance) || 0) - paymentAmount + (monthsAdvanced * monthlyRate);
    if (newWallet < 0) newWallet = 0; // Failsafe to prevent negative wallet

    // 3. Update client due date AND wallet balance
    db.prepare("UPDATE clients SET next_due_date = ?, wallet_balance = ? WHERE id = ?").run(revertedDateStr, newWallet, client.id);

    // 4. Automated Status Correction (mirror DELETE /payments/:id behavior)
    const now = new Date();
    const dNew = parseDateStrict(revertedDateStr);
    const settings = getSettings();
    const graceDays = (settings.grace_period || 3);
    const isOverdue = dNew && (new Date(dNew.getTime() + (graceDays * 24 * 60 * 60 * 1000)) < now);
    const newStatus = isOverdue ? 'unpaid' : 'active';
    db.prepare("UPDATE clients SET status = ? WHERE id = ?").run(newStatus, client.id);

    // 5. MikroTik Synchronization (background, best-effort)
    const pppoeUser = (client.pppoe_user || '').toString().trim();
    if (pppoeUser && pppoeUser.length >= 2) {
      if (isOverdue) {
        const targetUnpaidProfile = settings.unpaid_profile_name || 'unpaid';
        mikrotik.switchToUnpaid(pppoeUser, targetUnpaidProfile).catch(e => console.error(`❌ Void Suspension Failed:`, e.message));
        mikrotik.reconnectUser(pppoeUser).catch(e => console.error(`❌ Void Kicker Failed:`, e.message));
      } else {
        const planName = client.plan || 'default';
        mikrotik.restoreToPlan(pppoeUser, planName).catch(e => console.error(`❌ Void Restoration Failed:`, e.message));
        mikrotik.updatePPPoESecret(pppoeUser, {
          comment: `${client.full_name} | Due: ${formatDateMDY(revertedDateStr)}`
        }).catch(e => console.error(`❌ Void Comment Sync Failed:`, e.message));
      }
    }

    console.log(`🗑️ [PAYMENTS] Payment #${payment_id} DELETED (Voided) for ${client.full_name}. Due date reverted to ${revertedDateStr}, Wallet updated from ${client.wallet_balance} to ${newWallet}, Status: ${newStatus.toUpperCase()}`);
    res.json({ success: true, message: 'Payment record deleted and due date reverted.', rolledBack: true });
  } catch (err) {
    console.error('Void Payment Error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/clients/disconnect', requireAdmin, async (req, res) => {
  try {
    const { client_id } = req.body;
    if (!client_id) return res.status(400).json({ error: 'Client ID is required.' });
    const result = await handleDisconnect(client_id, req.session.admin.username);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/clients/reconnect', requireAdmin, async (req, res) => {
  try {
    const { client_id, next_due_date } = req.body;
    if (!client_id) return res.status(400).json({ error: 'Client ID is required.' });
    const result = await handleReconnect(client_id, next_due_date, req.session.admin.username);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/clients/kick-active', requireAdmin, async (req, res) => {
  try {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: 'Username is required.' });
    
    const { default: mikrotik } = { default: require('../utils/mikrotik') };
    await mikrotik.reconnectUser(username);
    res.json({ success: true, message: `Successfully disconnected session for ${username}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Payment Methods (Modes of Payment: GCash, Maya, Bank) ───
router.get('/payment-methods', requireAdmin, (req, res) => {
  try {
    const methods = db.prepare('SELECT * FROM payment_methods ORDER BY sort_order ASC, id ASC').all();
    res.json({ success: true, methods });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/payment-methods', requireAdmin, (req, res) => {
  try {
    const { name, type, account_name, account_number, qr_url, instructions, is_active, sort_order } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required.' });

    const result = db.prepare(`
      INSERT INTO payment_methods (name, type, account_name, account_number, qr_url, instructions, is_active, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      name,
      type || 'ewallet',
      account_name || '',
      account_number || '',
      qr_url || '',
      instructions || '',
      is_active === false ? 0 : 1,
      parseInt(sort_order) || 0
    );
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/payment-methods/:id', requireAdmin, (req, res) => {
  try {
    const { name, type, account_name, account_number, qr_url, instructions, is_active, sort_order } = req.body;
    const updates = [];
    const params = [];
    if (name !== undefined) { updates.push('name = ?'); params.push(name); }
    if (type !== undefined) { updates.push('type = ?'); params.push(type); }
    if (account_name !== undefined) { updates.push('account_name = ?'); params.push(account_name); }
    if (account_number !== undefined) { updates.push('account_number = ?'); params.push(account_number); }
    if (qr_url !== undefined) { updates.push('qr_url = ?'); params.push(qr_url); }
    if (instructions !== undefined) { updates.push('instructions = ?'); params.push(instructions); }
    if (is_active !== undefined) { updates.push('is_active = ?'); params.push(is_active ? 1 : 0); }
    if (sort_order !== undefined) { updates.push('sort_order = ?'); params.push(parseInt(sort_order) || 0); }
    if (updates.length === 0) return res.json({ success: true });
    params.push(req.params.id);
    db.prepare(`UPDATE payment_methods SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/payment-methods/:id', requireAdmin, (req, res) => {
  try {
    db.prepare('DELETE FROM payment_methods WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Roles (Access Control) ───
router.get('/roles', requireAdmin, (req, res) => {
  try {
    const roles = db.prepare('SELECT * FROM roles ORDER BY id ASC').all();
    res.json({ success: true, roles });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/roles', requireAdmin, (req, res) => {
  try {
    const { name, description, permissions, is_system } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required.' });
    if (db.prepare('SELECT id FROM roles WHERE name = ?').get(name)) {
      return res.status(400).json({ error: 'A role with this name already exists.' });
    }
    const result = db.prepare(`
      INSERT INTO roles (name, description, permissions, is_system)
      VALUES (?, ?, ?, ?)
    `).run(name, description || '', JSON.stringify(permissions || []), is_system ? 1 : 0);
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/roles/:id', requireAdmin, (req, res) => {
  try {
    const { name, description, permissions, is_system } = req.body;
    const existing = db.prepare('SELECT * FROM roles WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Role not found.' });
    if (existing.is_system && is_system !== undefined && !is_system) {
      return res.status(400).json({ error: 'System roles cannot be deactivated.' });
    }
    db.prepare('UPDATE roles SET name = ?, description = ?, permissions = ?, is_system = ? WHERE id = ?')
      .run(
        name || existing.name,
        description !== undefined ? description : existing.description,
        permissions !== undefined ? JSON.stringify(permissions) : existing.permissions,
        is_system !== undefined ? (is_system ? 1 : 0) : existing.is_system,
        req.params.id
      );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/roles/:id', requireAdmin, (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM roles WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Role not found.' });
    if (existing.is_system) return res.status(400).json({ error: 'System roles cannot be deleted.' });
    db.prepare('DELETE FROM roles WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Employees (Staff Management) ───
router.get('/employees', requireAdmin, (req, res) => {
  try {
    const employees = db.prepare(`
      SELECT id, full_name, username, email, phone, role_id, role_name, status, created_at, updated_at
      FROM employees ORDER BY id ASC
    `).all();
    res.json({ success: true, employees });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/employees', requireAdmin, (req, res) => {
  try {
    const { full_name, username, password, email, phone, role_id, role_name, status } = req.body;
    if (!full_name || !username) return res.status(400).json({ error: 'Full name and username are required.' });
    if (db.prepare('SELECT id FROM employees WHERE username = ?').get(username)) {
      return res.status(400).json({ error: 'A username already exists.' });
    }
    const hashed = password ? bcrypt.hashSync(password, 10) : null;
    const result = db.prepare(`
      INSERT INTO employees (full_name, username, password, email, phone, role_id, role_name, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(full_name, username, hashed, email || '', phone || '', role_id || null, role_name || '', status || 'active');
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/employees/:id', requireAdmin, (req, res) => {
  try {
    const { full_name, username, password, email, phone, role_id, role_name, status } = req.body;
    const existing = db.prepare('SELECT * FROM employees WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Employee not found.' });

    const updates = [];
    const params = [];
    if (full_name !== undefined) { updates.push('full_name = ?'); params.push(full_name); }
    if (username !== undefined) { updates.push('username = ?'); params.push(username); }
    if (password) { updates.push('password = ?'); params.push(bcrypt.hashSync(password, 10)); }
    if (email !== undefined) { updates.push('email = ?'); params.push(email); }
    if (phone !== undefined) { updates.push('phone = ?'); params.push(phone); }
    if (role_id !== undefined) { updates.push('role_id = ?'); params.push(role_id); }
    if (role_name !== undefined) { updates.push('role_name = ?'); params.push(role_name); }
    if (status !== undefined) { updates.push('status = ?'); params.push(status); }
    updates.push('updated_at = CURRENT_TIMESTAMP');
    if (updates.length === 1) return res.json({ success: true });
    params.push(req.params.id);
    db.prepare(`UPDATE employees SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/employees/:id', requireAdmin, (req, res) => {
  try {
    db.prepare('DELETE FROM employees WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

