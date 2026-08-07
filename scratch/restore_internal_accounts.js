// 🛡️ Restore protected internal accounts that were mistakenly auto-suspended
// This is a one-time repair for the ACC-2733 bug (company's own server account).
const db = require('../database');

// Same list as billing.js
const INTERNAL_ACCOUNT_EXCLUDES = [
  'server', 'backbone', 'main', 'core', 'owner', 'admin',
  'gateway', 'uplink', 'link', 'trunk', 'staff', 'free',
  'isp', 'sjm', 'sjkm', 'test', 'nms', 'monitor'
];

function isInternalAccount(client) {
  if (!client) return false;
  const haystack = [
    String(client.pppoe_user || '').toLowerCase().trim(),
    String(client.full_name || '').toLowerCase().trim(),
    String(client.account_id || '').toLowerCase().trim()
  ].join(' | ');
  return INTERNAL_ACCOUNT_EXCLUDES.some(keyword => haystack.includes(keyword));
}

console.log('=== RESTORE PROTECTED INTERNAL ACCOUNTS ===\n');

// Find all currently-suspended accounts
const suspended = db.prepare("SELECT id, account_id, full_name, pppoe_user, status, next_due_date FROM clients WHERE status = 'suspended'").all();

let restored = 0;
let skipped = 0;

const transaction = db.transaction(() => {
  for (const client of suspended) {
    if (isInternalAccount(client)) {
      // Set a safe future due date (today + 30 days) so they don't get flagged again
      const d = new Date();
      d.setDate(d.getDate() + 30);
      const safeDue = d.toISOString().split('T')[0];

      db.prepare("UPDATE clients SET status = 'active', next_due_date = ? WHERE id = ?").run(safeDue, client.id);
      console.log(`✅ RESTORED: [${client.account_id}] ${client.full_name} (${client.pppoe_user}) → active (due: ${safeDue})`);
      restored++;
    } else {
      skipped++;
    }
  }
});

transaction();

console.log(`\n${restored} protected account(s) restored to active.`);
console.log(`${skipped} real overdue account(s) left suspended (correct behavior).`);
console.log('\n=== DONE ===');
db.close();
