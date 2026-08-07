const express = require('express');
const router = express.Router();
const db = require('../database');
const { updateEnvValue } = require('../utils/envSync');
const bcrypt = require('bcryptjs');

/**
 * 🔍 Auto-Discovery (Disabled)
 */
router.get('/discover', (req, res) => {
  res.json([]);
});

/**
 * ✅ Connection Test (Always Success in Manual Mode)
 */
router.post('/test-mikrotik', async (req, res) => {
  res.json({ success: true, message: 'Manual Mode Active. Skipping MikroTik check.' });
});

/**
 * 📋 Fetch PPP Profiles (Returns defaults in Manual Mode)
 */
router.post('/mikrotik-profiles', async (req, res) => {
  res.json({ success: true, profiles: ['default', '10MBPS', '20MBPS', '30MBPS', '50MBPS'] });
});

/**
 * 🚀 Final Setup Submission
 */
router.post('/submit', async (req, res) => {
  const { 
    isp_name, 
    support_email,
    support_phone,
    support_address,
    mt_host,
    mt_user,
    mt_pass,
    smtp_user,
    smtp_pass,
    admin_user,
    admin_pass,
    admin_name
  } = req.body;

  // 1. Check if already setup
  const adminCount = db.prepare('SELECT count(*) as count FROM admin_users').get().count;
  if (adminCount > 0) {
    return res.status(403).json({ error: 'Setup already completed. Use the dashboard to change settings.' });
  }

  if (!admin_user || !admin_pass) {
    return res.status(400).json({ error: 'Admin username and password are required.' });
  }

  try {
    // 2. Save MikroTik & SMTP to .env
    if (mt_host)   { updateEnvValue('MIKROTIK_HOST',     mt_host); process.env.MIKROTIK_HOST = mt_host; }
    if (mt_user)   { updateEnvValue('MIKROTIK_USER',     mt_user); process.env.MIKROTIK_USER = mt_user; }
    if (mt_pass)   { updateEnvValue('MIKROTIK_PASSWORD', mt_pass); process.env.MIKROTIK_PASSWORD = mt_pass; }
    if (smtp_user) { updateEnvValue('SMTP_USER', smtp_user); }
    if (smtp_pass) { updateEnvValue('SMTP_PASS', smtp_pass); }

    // 3. Update Database Settings (company branding)
    db.prepare(`
      UPDATE settings 
      SET company_name = ?, support_email = ?, support_phone = ?, company_address = ?
      WHERE id = 1
    `).run(
      isp_name    || 'My ISP', 
      support_email   || '',
      support_phone   || '',
      support_address || ''
    );

    // 4. Create first Admin Account
    const hashedPassword = bcrypt.hashSync(admin_pass, 10);
    db.prepare(`
      INSERT INTO admin_users (username, password, full_name, email)
      VALUES (?, ?, ?, ?)
    `).run(admin_user, hashedPassword, admin_name || admin_user, support_email || '');

    // 5. Mark setup as complete in settings
    try {
      db.prepare(`UPDATE settings SET setup_complete = 1 WHERE id = 1`).run();
    } catch(e) {} // Column may not exist on older DBs — safe to ignore

    res.json({ success: true, message: 'Setup completed! Redirecting to login...' });
  } catch (err) {
    console.error('Setup Error:', err);
    res.status(500).json({ error: 'Setup failed: ' + err.message });
  }
});

module.exports = router;
