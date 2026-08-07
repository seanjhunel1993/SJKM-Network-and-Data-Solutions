// 🛡️ CRITICAL: Force IPv4 for ALL network connections in this process.
// Must be set before any module loads to prevent ENETUNREACH IPv6 errors.
require('dns').setDefaultResultOrder('ipv4first');

const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
process.env.TZ = 'Asia/Manila';
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const db = require('./database');
const adminRoutes = require('./routes/admin');
const setupRoutes = require('./routes/setup');
const cookieParser = require('cookie-parser');

const { sendEmail } = require('./utils/email');
const emailTemplates = require('./utils/emailTemplates');
const os = require('os');
const { startSmsWorker } = require('./utils/smsWorker');
const { startEmailWorker } = require('./utils/emailWorker');
const { runBillingChecks } = require('./utils/billing');
const logger = require('./utils/logger'); // 📝 New Centralized Logger

const app = express();
// PORT in .env may be empty string; coerce to a valid number or default to 3000
const rawPort = parseInt(process.env.PORT, 10);
const PORT = (!isNaN(rawPort) && rawPort > 0) ? rawPort : 3000;

// ─── Middleware ───

/**
 * Restricts access to Localhost only (127.0.0.1 or ::1) by default.
 * Set ALLOW_REMOTE_ADMIN=true in .env to allow remote access via port forwarding.
 */
const restrictToLocal = (req, res, next) => {
  // ─── Remote Access Mode ───
  // If ALLOW_REMOTE_ADMIN=true in .env, skip the localhost check entirely.
  // Use this when you have port forwarding set up on your MikroTik router.
  if (process.env.ALLOW_REMOTE_ADMIN === 'true') {
    return next();
  }

  const ip = req.ip || req.connection.remoteAddress;
  const isLocal = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';

  // Cloudflare Tunnels (via cloudflared) typically add 'x-forwarded-for' or 'cf-connecting-ip'.
  // We check for these to ensure someone isn't bypassing the 'isLocal' check via the tunnel.
    const viaTunnel = req.headers['x-forwarded-for'] || req.headers['cf-connecting-ip'];
  
    if (isLocal && !viaTunnel) {
      return next();
    }
  
    logger.warn(`[SECURITY] Blocked external access to Admin Portal from IP: ${ip}`);
    res.status(403).send(`
    <div style="font-family: sans-serif; text-align: center; padding-top: 50px;">
      <h1 style="color: #ef4444;">403 Forbidden</h1>
      <p>The Admin Portal is restricted to Local Access only.</p>
      <hr style="width: 50%; margin: 20px auto;">
      <p style="color: #666; font-size: 0.9rem;">To enable remote access, set <strong>ALLOW_REMOTE_ADMIN=true</strong> in your .env file and restart the server.</p>
    </div>
  `);
};
// ─── Security Layer: DDoS & Brute Force Protection ───
const loginLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Limit each IP to 10 login attempts per hour
  message: { error: 'Too many login attempts. Please try again in an hour.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply Helmet with hardened settings
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://*"],
      // Allow inline event handlers (onclick, onchange etc.) used throughout the admin portal
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://*"],
      fontSrc: ["'self'", "https://*"],
      imgSrc: ["'self'", "data:", "blob:", "https://*"],
      connectSrc: ["'self'", "https://*"],
    },
  },
  crossOriginEmbedderPolicy: false,
  xssFilter: true, // Anti-XSS
  noSniff: true,   // Anti-MIME Sniffing
  hidePoweredBy: true, // Hide Express identity
}));

app.use(express.json({ limit: '10mb' })); // Balanced for uploads & backups
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

app.use(session({
  name: '__isp_sid', // Obfuscated session name
  secret: process.env.SESSION_SECRET || 'isp-hardened-secret-2024-!@#$',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 12 * 60 * 60 * 1000, // 12 hours (reduced for safety)
    httpOnly: true, // Prevents client-side JS from stealing cookie
    secure: process.env.NODE_ENV === 'production', // Only send over HTTPS in production
    sameSite: 'strict', // Prevents CSRF attacks
  }
}));

// Apply rate limits to sensitive routes
// ─── Security Limiters (Relaxed for Owner) ───
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 1000, // Very high limit for live dashboard
  message: { error: 'Too many requests' }
});

// app.use('/api/customer/login', loginLimiter);
app.use('/api/', (req, res, next) => {
  // Bypass limiter for local admin/owner
  if (req.ip === '::1' || req.ip === '127.0.0.1') return next();
  apiLimiter(req, res, next);
});

// Licensing logic removed per decommissioning plan

// Activation APIs removed per decommissioning plan

// ─── Public Application Tracker ───
app.get('/api/public/track/:ref', (req, res) => {
  try {
    const ref = (req.params.ref || '').toUpperCase().trim();
    if (!ref || !ref.startsWith('APP-')) return res.status(400).json({ error: 'Invalid reference number.' });
    
    const application = db.prepare('SELECT full_name, desired_plan, status, scheduled_date, admin_notes, created_at FROM applications WHERE UPPER(reference_no) = ?').get(ref);
    if (!application) return res.status(404).json({ error: 'Application not found.' });
    
    res.json({
      reference_no: ref,
      full_name: application.full_name,
      plan: application.desired_plan,
      status: application.status,
      scheduled_date: application.scheduled_date || null,
      admin_notes: ['approved','rejected'].includes(application.status) ? (application.admin_notes || null) : null,
      submitted_at: application.created_at
    });
  } catch(e) {
    res.status(500).json({ error: 'Tracker unavailable.' });
  }
});

// ─── Public Branding & Plans ───
app.get('/api/public/branding', (req, res) => {
  try {
    const settings = (db.data.settings && db.data.settings[0]) || {};
    res.json({
      company_name:  settings.company_name  || 'ISP Monitoring',
      support_email: settings.support_email || 'support@isp.local',
      support_phone: settings.support_phone || settings.gcash_number || '09XXXXXXXXX',
      hero_logo_url: settings.hero_logo_url || '',
      hero_title:    settings.hero_title    || '',
      hero_subtitle: settings.hero_subtitle || '',
      facebook_url:  settings.facebook_url  || '',
      company_address: settings.company_address || 'Cabanatuan City, Nueva Ecija',
      gcash_number:  settings.gcash_number || '',
      gcash_name:    settings.gcash_name   || '',
      gcash_qr_url:  settings.gcash_qr_url || '',
      maya_number:   settings.maya_number  || '',
      maya_name:     settings.maya_name    || '',
      maya_qr_url:   settings.maya_qr_url  || ''
    });
  } catch(e) {
    res.json({ company_name: 'ISP Monitoring' });
  }
});

app.get('/api/public/plans', (req, res) => {
  res.json(db.data.plans || []);
});


// ─── Public Coverage Zones (for Customer Map) ───
app.get('/api/public/coverage-zones', (req, res) => {
  try {
    const zones = db.prepare('SELECT id, name, type, coordinates, center_lat, center_lng, radius, color FROM coverage_zones WHERE is_active = 1').all();
    res.json(zones.map(z => ({
      ...z,
      coordinates: z.coordinates ? JSON.parse(z.coordinates) : []
    })));
  } catch (e) {
    res.json([]);
  }
});


// ─── First-Run Setup Middleware ───
const checkSetup = (req, res, next) => {
  const adminCount = db.prepare('SELECT count(*) as count FROM admin_users').get().count;
  const isSetupPath = req.path.includes('setup.html') || req.path.startsWith('/api/setup') || req.path.includes('shared');

  if (adminCount === 0) {
    if (!isSetupPath) {
      if (req.path.startsWith('/api/admin')) {
        return res.status(403).json({ error: 'SETUP_REQUIRED' });
      }
      return res.redirect('/admin/setup.html');
    }
  } else {
    if (req.path.includes('setup.html') && req.query.preview !== '1') {
      return res.redirect('/admin/network-map.html');
    }
  }
  next();
};

// ─── Static Routes & API Mounting ───
const UPLOADS_FOLDER = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(UPLOADS_FOLDER)) fs.mkdirSync(UPLOADS_FOLDER, { recursive: true });

app.use('/admin', checkSetup, restrictToLocal, express.static(path.join(__dirname, 'public', 'admin')));
// app.use('/customer', express.static(path.join(__dirname, 'public', 'customer')));
app.use('/shared', express.static(path.join(__dirname, 'public', 'shared')));
app.use('/uploads', express.static(UPLOADS_FOLDER));

app.use('/api/setup', setupRoutes);
app.use('/api/admin', checkSetup, restrictToLocal, adminRoutes);
// app.use('/api/customer', customerRoutes);


// ─── Captive Portal Redirect Middleware ───
/**
 * Detects requests from the UNPAID subnet and redirects them to the payment portal.
 * This is the magic that triggers the "Sign in to network" popup on Android/iOS.
 */
app.use((req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress;
  
  // Check if the IP is from our UNPAID subnet (177.177.177.x)
  const fromUnpaidSubnet = ip.includes('177.177.177.');
  
  if (fromUnpaidSubnet) {
    // 1. Allow access to static assets for the portal to look good
    const isShared = req.path.startsWith('/shared/');
    const isApiPublic = req.path.startsWith('/api/public/');
    const isPortal = req.path === '/payment-notice.html';
    
    if (isShared || isApiPublic || isPortal) {
      return next();
    }
    
    // 2. Redirect EVERYTHING else to the payment portal
    // (This includes the OS's hidden connectivity checks like /generate_204)
    console.log(`[CAPTIVE PORTAL] Redirecting unpaid client ${ip} to Payment Notice.`);
    return res.redirect('/payment-notice.html');
  }
  
  next();
});

// Root redirect
app.get(['/', '/admin', '/admin/', '/admin/index.html'], (req, res) => {
  res.redirect('/admin/index.html');
});

// Payment Notice Portal (Captive Portal Landing Page)
app.get('/payment-notice.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'payment-notice.html'));
});

// ─── Multer Setup for Payment Proof Uploads (Captive Portal) ───
const multer = require('multer');

const RECEIPTS_FOLDER = path.join(__dirname, 'public', 'uploads', 'receipts');
if (!fs.existsSync(RECEIPTS_FOLDER)) fs.mkdirSync(RECEIPTS_FOLDER, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, RECEIPTS_FOLDER),
  filename: (req, file, cb) => {
    const ext = (path.extname(file.originalname) || '.png').toLowerCase();
    cb(null, `receipt-${Date.now()}-${Math.floor(Math.random() * 100000)}${ext}`);
  }
});

const proofUpload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp|pdf/;
    const ok = allowed.test((file.mimetype || '')) || allowed.test((path.extname(file.originalname) || '').toLowerCase());
    cb(ok ? null : new Error('Only image files (JPG, PNG, GIF, WEBP) or PDF are allowed.'), ok);
  }
});

// ─── PUBLIC API: Submit Payment Proof (from Captive Portal) ───
app.post('/api/public/submit-proof', proofUpload.single('receipt'), (req, res) => {
  try {
    const { account_id, amount, method, full_name, notes } = req.body || {};

    if (!account_id) {
      return res.status(400).json({ error: 'Account ID is required.' });
    }

    const accId = String(account_id).trim().toUpperCase();
    const client = db.prepare('SELECT id, full_name, account_id, contact, email FROM clients WHERE UPPER(account_id) = ?').get(accId);

    if (!client) {
      // Clean up uploaded file if account not found
      if (req.file && req.file.path) {
        try { fs.unlinkSync(req.file.path); } catch (e) {}
      }
      return res.status(404).json({ error: 'Account not found. Please check your Account ID and try again.' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Please attach a screenshot or photo of your payment receipt.' });
    }

    const methodClean = ['gcash', 'maya', 'cash', 'bank'].includes(String(method || '').toLowerCase())
      ? String(method).toLowerCase()
      : 'other';
    const amountNum = parseFloat(amount) || 0;
    const submitterName = (full_name || client.full_name || '').toString().trim();

    const result = db.prepare(`
      INSERT INTO payment_proofs (client_id, full_name, account_id, filename, original_name, amount, method, status, admin_notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending_verification', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(
      client.id,
      submitterName,
      client.account_id || client.id,
      path.basename(req.file.filename),
      req.file.originalname || path.basename(req.file.filename),
      amountNum,
      methodClean,
      notes || ''
    );

    // Log event for admin dashboard visibility
    try {
      db.prepare("INSERT INTO events (type, pppoe_user, caller_id, ip_address, timestamp) VALUES (?, ?, ?, ?, ?)")
        .run('PAYMENT_PROOF_SUBMITTED', client.pppoe_user || account_id, 'Captive Portal',
          `Submitted ₱${amountNum} via ${methodClean} (Proof #${result.lastInsertRowid})`, new Date().toISOString());
    } catch (e) {}

    res.json({
      success: true,
      message: 'Payment proof submitted! Our team will verify and restore your connection shortly.',
      proof_id: result.lastInsertRowid
    });
  } catch (err) {
    console.error('[SUBMIT-PROOF] Error:', err.message);
    if (req.file && req.file.path) {
      try { fs.unlinkSync(req.file.path); } catch (e) {}
    }
    res.status(500).json({ error: 'Failed to submit payment proof: ' + err.message });
  }
});

// ─── PUBLIC API: Check proof status (for "I have already paid" flow) ───
app.get('/api/public/proof-status', (req, res) => {
  try {
    const accountId = String(req.query.account_id || '').trim().toUpperCase();
    if (!accountId) return res.status(400).json({ error: 'Account ID is required.' });

    const client = db.prepare('SELECT id FROM clients WHERE UPPER(account_id) = ?').get(accountId);
    if (!client) return res.status(404).json({ error: 'Account not found.' });

    const proof = db.prepare(`
      SELECT status, created_at, amount, method FROM payment_proofs
      WHERE client_id = ? ORDER BY id DESC LIMIT 1
    `).get(client.id);

    res.json({
      success: true,
      hasProof: !!proof,
      status: proof ? proof.status : null,
      amount: proof ? proof.amount : 0,
      method: proof ? proof.method : null,
      submitted_at: proof ? proof.created_at : null
    });
  } catch (e) {
    res.status(500).json({ error: 'Status check failed.' });
  }
});


const { sendSMS } = require('./utils/sms');

// ─── Start ───
async function start() {
  // Start the web server immediately
  app.listen(PORT, () => {
    logger.info('╔══════════════════════════════════════════════════╗');
    logger.info('║           SJKM NETWORK DATA LINK                 ║');
    logger.info('║══════════════════════════════════════════════════║');
    logger.info(`║  🔧 Admin Portal:    http://localhost:${PORT}/admin/    ║`);
    logger.info('╚══════════════════════════════════════════════════╝');
  });

  // --- 📅 3-Day Database Backup via Email ---
  const run3DayBackup = async () => {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    
    // Check settings if backup is enabled
    const settings = db.prepare('SELECT admin_alert_email, support_email FROM settings LIMIT 1').get() || {};
    const targetEmail = settings.support_email || settings.admin_alert_email;
    
    if (!targetEmail) {
      logger.warn('🗓️ [BACKUP] Skipping 3-day backup: No admin email configured.');
      return;
    }

    try {
      logger.info('🗓️ [BACKUP] Starting 3-day Database Backup...');
      const dbPath = path.join(__dirname, 'data', 'isp_db.sqlite');
      const backupPath = path.join(__dirname, 'data', `backup_${today}.sqlite`);
      
      // 1. Copy the database file (Atomic copy)
      fs.copyFileSync(dbPath, backupPath);
      
      // 2. Send via Email
      const result = await sendEmail(
        targetEmail, 
        'SYSTEM BACKUP: Database Snapshot', 
        `Attached is the database backup for ${today}. Please keep this file in a safe location.`,
        `<h2>System Database Backup</h2><p>Date: <b>${today}</b></p><p>Attached is a snapshot of your ISP Management System database. Please store this securely.</p>`,
        [{ filename: `isp_db_${today}.sqlite`, path: backupPath }]
      );

      if (result.success) {
        logger.info(`🗓️ [BACKUP] Database sent successfully to ${targetEmail}`);
      } else {
        logger.error(`🗓️ [BACKUP] Email delivery failed: ${result.error}`);
      }

      // 3. Cleanup local backup file after 10 minutes (safe margin for email queue)
      setTimeout(() => {
        if (fs.existsSync(backupPath)) {
          try {
            fs.unlinkSync(backupPath);
            logger.info(`🗓️ [BACKUP-CLEANUP] Temporary backup file removed: ${path.basename(backupPath)}`);
          } catch(e) {}
        }
      }, 600000);

    } catch (err) {
      logger.error(`🗓️ [BACKUP] Critical Error: ${err.message}`);
    }
  };

  // Check every hour, and run if 3 days have passed since last backup
  const checkAndRunBackup = () => {
    const now = Date.now(); // Milliseconds
    // Fetch the last backup record (using numeric timestamp if available, else fallback)
    const lastBackup = db.prepare("SELECT sent_at FROM reminders_log WHERE type = 'DB_BACKUP' ORDER BY id DESC LIMIT 1").get();
    
    let shouldRun = false;
    if (!lastBackup || !lastBackup.sent_at) {
      logger.info('🗓️ [BACKUP-CHECK] No previous backup history. Triggering initial backup.');
      shouldRun = true;
    } else {
      // Try to parse as numeric timestamp, fallback to date string
      let lastTs = parseInt(lastBackup.sent_at);
      if (isNaN(lastTs)) {
         lastTs = new Date(lastBackup.sent_at.replace(' ', 'T') + 'Z').getTime();
      }

      const diffMs = now - lastTs;
      const diffHours = diffMs / (1000 * 60 * 60);
      
      if (diffHours >= 23.8) { // Daily backup (with small buffer)
        shouldRun = true;
      } else {
        const remainingHours = (24 - diffHours).toFixed(1);
        logger.info(`🗓️ [BACKUP-CHECK] Last backup was ${diffHours.toFixed(1)}h ago. Next backup in ${remainingHours}h. Skipping.`);
      }
    }

    if (shouldRun) {
      try {
        // Record the attempt using numeric timestamp for perfect accuracy
        db.prepare("INSERT INTO reminders_log (type, target, sent_at) VALUES (?, ?, ?)").run('DB_BACKUP', 'Admin Email', Date.now().toString());
        logger.info('🗓️ [BACKUP-CHECK] Schedule record created. Proceeding with send...');
        
        run3DayBackup()
          .then(() => logger.info('🗓️ [BACKUP-CHECK] 3-day backup process finished.'))
          .catch(err => logger.error(`[BACKUP-CRON] Send process failed: ${err.message}`));
      } catch (e) {
        logger.error(`[BACKUP-CRON] Critical scheduling error: ${e.message}`);
      }
    }
  };

  // Run immediately on startup, then check hourly
  checkAndRunBackup();
  setInterval(checkAndRunBackup, 60 * 60 * 1000);

  // --- Weekly Maintenance Job (Every 7 Days, with catch-up) ---
  const checkAndRunMaintenance = () => {
    const now = Date.now();
    const lastMaint = db.prepare("SELECT sent_at FROM reminders_log WHERE type = 'SYSTEM_MAINTENANCE' ORDER BY id DESC LIMIT 1").get();
    let shouldRun = false;

    if (!lastMaint || !lastMaint.sent_at) {
        shouldRun = true;
    } else {
        let lastTs = parseInt(lastMaint.sent_at);
        if (isNaN(lastTs)) {
           lastTs = new Date(lastMaint.sent_at.replace(' ', 'T') + 'Z').getTime();
        }
        const diffMs = now - lastTs;
        const diffDays = diffMs / (1000 * 60 * 60 * 24);
        if (diffDays >= 6.9) shouldRun = true; 
    }

    if (shouldRun) {
        logger.info('🧹 [SYSTEM] Running scheduled maintenance & optimization...');
        db.maintenance();
        db.prepare("INSERT INTO reminders_log (type, target, sent_at) VALUES (?, ?, ?)").run('SYSTEM_MAINTENANCE', 'System', Date.now().toString());
    }
  };

  // Run on startup and check every 6 hours
  checkAndRunMaintenance();
  setInterval(checkAndRunMaintenance, 6 * 60 * 60 * 1000);

  // --- Daily Billing Reminders (SMS & Email) ---
  const checkAndRunBilling = () => {
      runBillingChecks().catch(err => logger.error(`[BILLING-CRON] Failed: ${err.message}`));
  };

  // Run once on startup, then check every hour
  checkAndRunBilling();
  setInterval(checkAndRunBilling, 60 * 60 * 1000);

  // --- Start Resilience Queue Workers ---
  startSmsWorker();
  startEmailWorker();

  // --- Background Bandwidth Usage Monitor ---
  const startBandwidthMonitor = () => {
    const mikrotik = require('./utils/mikrotik');
    setInterval(async () => {
      try {
        await mikrotik.getActivePPPoE();
      } catch (err) {
        // Silently handle offline/disabled router
      }
    }, 60 * 1000); // Check every 60 seconds
  };
  startBandwidthMonitor();
}

// ─── Execute Startup ───
start().then(() => {
    console.log(`\n\x1b[36m┌────────────────────────────────────────────────────────┐\x1b[0m`);
    console.log(`\x1b[36m│\x1b[0m \x1b[1;32m      SJKM NETWORK DATA LINK - ONLINE       \x1b[0m \x1b[36m│\x1b[0m`);
    console.log(`\x1b[36m├────────────────────────────────────────────────────────┤\x1b[0m`);
    console.log(`\x1b[36m│\x1b[0m \x1b[33m 🌐 Admin Portal:\x1b[0m http://localhost:3000/admin/     \x1b[36m│\x1b[0m`);
    console.log(`\x1b[36m│\x1b[0m \x1b[33m 📊 System Status:\x1b[0m Production Ready / Secure         \x1b[36m│\x1b[0m`);
    console.log(`\x1b[36m└────────────────────────────────────────────────────────┘\x1b[0m\n`);
}).catch(err => {
  console.error('❌ CRITICAL: Server failed to start:', err);
  process.exit(1);
});
