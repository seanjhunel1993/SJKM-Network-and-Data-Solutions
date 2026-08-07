// 🔍 Verify internal account protection & restoration
const db = require('../database');

console.log('=== INTERNAL ACCOUNT VERIFICATION ===\n');

// 1. Find the SJKM@SERVER / ACC-2733 account
const serverAccount = db.prepare(`
  SELECT id, account_id, full_name, pppoe_user, status, next_due_date, plan
  FROM clients 
  WHERE LOWER(pppoe_user) LIKE '%server%' 
     OR LOWER(account_id) LIKE '%2733%'
     OR LOWER(full_name) LIKE '%server%'
     OR LOWER(full_name) LIKE '%sjkm%'
`).all();

console.log('--- Accounts matching internal patterns ---');
if (serverAccount.length === 0) {
  console.log('(none found)');
} else {
  serverAccount.forEach(c => {
    console.log(`  [${c.account_id}] ${c.full_name} | pppoe: ${c.pppoe_user} | status: ${c.status} | due: ${c.next_due_date}`);
  });
}

// 2. Check all currently-suspended accounts
console.log('\n--- Currently suspended accounts ---');
const suspended = db.prepare("SELECT id, account_id, full_name, pppoe_user, status FROM clients WHERE status = 'suspended'").all();
if (suspended.length === 0) {
  console.log('(none)');
} else {
  suspended.forEach(c => {
    console.log(`  [${c.account_id}] ${c.full_name} | pppoe: ${c.pppoe_user}`);
  });
}

// 3. Simulate the isInternalAccount check from billing.js
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

console.log('\n--- Protection check (isInternalAccount) ---');
const allClients = db.prepare("SELECT id, account_id, full_name, pppoe_user, status FROM clients").all();
let protectedCount = 0;
allClients.forEach(c => {
  if (isInternalAccount(c)) {
    protectedCount++;
    console.log(`  🛡️ PROTECTED: [${c.account_id}] ${c.full_name} (${c.pppoe_user}) — status: ${c.status}`);
  }
});
console.log(`\nTotal protected internal accounts: ${protectedCount}`);

// 4. Verify the specific SJKM@SERVER account
console.log('\n--- SJKM@SERVER specific check ---');
const sjkm = allClients.find(c => String(c.pppoe_user || '').toLowerCase().includes('sjkm') || String(c.full_name || '').toLowerCase().includes('sjkm'));
if (sjkm) {
  const protected = isInternalAccount(sjkm);
  console.log(`  Account: [${sjkm.account_id}] ${sjkm.full_name} (${sjkm.pppoe_user})`);
  console.log(`  Status: ${sjkm.status}`);
  console.log(`  Protected from auto-suspend: ${protected ? 'YES ✅' : 'NO ❌'}`);
  if (sjkm.status === 'suspended') {
    console.log('  ⚠️ WARNING: This account is currently SUSPENDED and needs restoration!');
  } else {
    console.log('  ✅ Account is in a safe state.');
  }
} else {
  console.log('  (SJKM account not found in database)');
}

console.log('\n=== VERIFICATION COMPLETE ===');
db.close();

