/**
 * 🔄 FULL DATABASE RESET — Back to First-Setup State
 * Clears ALL data and admin accounts so the setup page appears again.
 * Seed the default settings row so the app boots cleanly.
 */
const path = require('path');
const fs = require('fs');

// Close any existing handle first (in case server is running)
const dbPath = path.join(__dirname, '..', 'data', 'isp_db.sqlite');

// Delete WAL/SHM files so the DB is clean
['-wal', '-shm'].forEach(suffix => {
  const p = dbPath + suffix;
  if (fs.existsSync(p)) {
    try {
      fs.unlinkSync(p);
      console.log(`🗑️ Removed ${path.basename(p)}`);
    } catch (e) {
      console.log(`⚠️ Could not remove ${path.basename(p)}: ${e.message}`);
    }
  }
});

const db = require('../database');

// All data tables to clear (keep schema, drop data)
const tables = [
  'admin_users', 'clients', 'payments', 'applications', 'support_tickets',
  'events', 'reminders_log', 'broadcasts', 'portal_notices', 'payment_proofs',
  'expenses', 'installations', 'activity_log', 'bandwidth_usage',
  'traffic_history', 'sms_queue', 'email_queue', 'coverage_zones',
  'payment_methods', 'employees', 'roles', 'invoices'
];

db.transaction(() => {
  for (const t of tables) {
    try {
      db.prepare(`DELETE FROM ${t}`).run();
      console.log(`🧹 Cleared ${t}`);
    } catch (e) {
      console.log(`⚠️ Skip ${t}: ${e.message}`);
    }
  }
})();

// Re-seed default settings row (id=1) so app boots cleanly
try {
  db.prepare(`
    INSERT OR REPLACE INTO settings (id, company_name, support_email, support_phone,
      reminder_1_days, reminder_2_days, grace_period, email_enabled, sms_enabled,
      enable_sms_billing, enable_sms_apps, enable_sms_broadcasts, enable_sms_receipts,
      enable_sms_alerts, disable_mikrotik)
    VALUES (1, 'SJKM Network and Data Solutions', '', '', 7, 2, 3, 1, 0, 1, 1, 1, 1, 1, 0)
  `).run();
  console.log('✅ Default settings row seeded (id=1)');
} catch (e) {
  console.log('⚠️ Settings seed: ' + e.message);
}

// Verify
console.log('\n=== VERIFICATION ===');
console.log('admin_users count:', db.prepare('SELECT COUNT(*) c FROM admin_users').get().c);
console.log('clients count:', db.prepare('SELECT COUNT(*) c FROM clients').get().c);
console.log('payments count:', db.prepare('SELECT COUNT(*) c FROM payments').get().c);
console.log('settings row:', JSON.stringify(db.prepare('SELECT company_name, grace_period FROM settings WHERE id=1').get()));

db.close();
console.log('\n✅ DATABASE RESET COMPLETE. Run the setup page to create your admin account.');
