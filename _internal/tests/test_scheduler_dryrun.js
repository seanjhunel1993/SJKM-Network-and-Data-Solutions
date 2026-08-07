const scheduler = require('./utils/scheduler');
const db = require('./database');

async function dryRunTest() {
    console.log('🧪 Starting Billing Scheduler Dry-Run...');
    
    // 1. Check current count
    const initialCount = (db.data.events || []).filter(e => e.type && e.type.includes('Reminder')).length;
    console.log(`📊 Initial Reminder Count: ${initialCount}`);

    // 2. Mock a client due today
    const testUser = 'test_due_today';
    const originalClients = [...db.data.clients];
    
    db.data.clients.push({
        id: 9999,
        full_name: 'Premium Test Client',
        email: 'test@example.com',
        pppoe_user: testUser,
        next_due_date: new Date().toISOString().split('T')[0], // Today
        status: 'active',
        plan: '50MBPS'
    });

    // 3. Run the checks (will skip real email if SMTP not set, but will log to DB)
    await scheduler.runBillingChecks();

    // 4. Check new count
    const finalCount = (db.data.events || []).filter(e => e.type && e.type.includes('Reminder')).length;
    console.log(`📊 Final Reminder Count: ${finalCount}`);

    if (finalCount > initialCount) {
        console.log('🎉 SUCCESS: Automated reminder logic and event logging is working perfectly!');
    }

    // Cleanup
    db.data.clients = originalClients;
}

dryRunTest();
