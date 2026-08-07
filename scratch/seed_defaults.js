// Seed default settings row after database clear (fresh install)
const db = require('../database');

db.prepare(`
  INSERT OR IGNORE INTO settings (id, company_name, support_email, support_phone,
    reminder_1_days, reminder_2_days, grace_period, email_enabled, sms_enabled,
    enable_sms_billing, enable_sms_apps, enable_sms_broadcasts, enable_sms_receipts,
    enable_sms_alerts, disable_mikrotik)
  VALUES (1, 'My ISP', '', '', 7, 2, 3, 1, 0, 1, 1, 1, 1, 1, 0)
`).run();

const s = db.prepare('SELECT id, company_name, grace_period, email_enabled FROM settings WHERE id=1').get();
console.log('Default settings row:', JSON.stringify(s));
console.log('admin count:', db.prepare('SELECT COUNT(*) c FROM admin_users').get().c);
console.log('clients count:', db.prepare('SELECT COUNT(*) c FROM clients').get().c);
console.log('plans count:', db.prepare('SELECT COUNT(*) c FROM plans').get().c);
db.close();
