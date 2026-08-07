const db = require('./database');

async function testMetricsDirectly() {
  console.log('🧪 Testing Sales & Billing Metrics (Direct DB Check)...\n');

  try {
    const store = db.getRawStore();
    
    // Clean up any previous test payments to ensure clean state
    store.payments = store.payments.filter(p => !p.test);

    // Add a test payment from exactly now
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    
    store.payments.push({
      id: 9999,
      amount: 1500,
      created_at: todayStr,
      status: 'paid',
      test: true
    });

    console.log('--- Test: Weekly Revenue Calculation ---');
    const weeklyQuery = "SELECT SUM(amount) as total FROM payments WHERE created_at >= date('now', '-7 days')";
    const result = db.prepare(weeklyQuery).get();
    
    console.log(`Weekly Total Result: ${result.total}`);
    if (result.total >= 1500) {
      console.log('✅ Passed: Metrics correctly identified the recent 1500 payment.');
    } else {
      console.log('❌ Failed: Metrics returned ' + result.total);
    }

    console.log('\n--- Test: Yearly Revenue Calculation ---');
    const yearlyQuery = "SELECT SUM(amount) as total FROM payments WHERE created_at >= date('now', '-1 year')";
    const resultYearly = db.prepare(yearlyQuery).get();
    console.log(`Yearly Total Result: ${resultYearly.total}`);
    if (resultYearly.total >= 1500) {
      console.log('✅ Passed: Metrics correctly identified the payment in the yearly total.');
    } else {
      console.log('❌ Failed: Metrics returned ' + resultYearly.total);
    }

    // Clean up
    store.payments = store.payments.filter(p => !p.test);

  } catch (err) {
    console.error('❌ Test Error:', err);
  }

  console.log('\n🏁 Metrics verification complete.');
}

testMetricsDirectly();
