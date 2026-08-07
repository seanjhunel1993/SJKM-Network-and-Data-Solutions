// 🧪 Test the billing scan to confirm no internal accounts get suspended
const { runBillingChecks } = require('../utils/billing');

(async () => {
  const result = await runBillingChecks('SYSTEM-TEST');
  console.log('=== BILLING SCAN TEST RESULT ===');
  console.log('Success:', result.success);
  console.log('Suspended this run:', result.stats ? result.stats.suspended : 'n/a');
  console.log('Errors:', result.stats ? result.stats.errors : 'n/a');

  // Verify SJKM@SERVER still active
  const db = require('../database');
  const sjkm = db.prepare("SELECT id, account_id, full_name, pppoe_user, status FROM clients WHERE LOWER(pppoe_user) LIKE '%sjkm%' OR LOWER(account_id)='acc-2733'").all();
  console.log('\n=== SJKM / SERVER ACCOUNTS AFTER SCAN ===');
  sjkm.forEach(c => {
    console.log(`  [${c.account_id}] ${c.full_name} (${c.pppoe_user}) → status: ${c.status}`);
  });

  // Confirm all protected accounts are active
  const protected = db.prepare("SELECT id, account_id, pppoe_user, status FROM clients WHERE LOWER(pppoe_user) IN ('sjkm@server','unpaidtest','free@makk','server@tenda')").all();
  console.log('\n=== ALL PROTECTED ACCOUNTS AFTER SCAN ===');
  let allSafe = true;
  protected.forEach(c => {
    const safe = c.status === 'active';
    if (!safe) allSafe = false;
    console.log(`  [${c.account_id}] ${c.pppoe_user} → ${c.status} ${safe ? '✅' : '❌'}`);
  });
  console.log(`\n${allSafe ? '✅ ALL PROTECTED ACCOUNTS ARE SAFE (status=active)' : '❌ SOME PROTECTED ACCOUNTS ARE NOT ACTIVE'}`);

  db.close();
  process.exit(allSafe ? 0 : 1);
})();
