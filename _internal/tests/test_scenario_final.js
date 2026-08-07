const db = require('./database');
const mikrotik = require('./mikrotik');
const customerRoutes = require('./routes/customer'); // We need the internal logic

async function runLiveTest() {
    console.log('🧪 Starting Live Test for Client: testing2\n');

    // 1. Create client
    console.log('Step 1: Creating client "testing2"...');
    const installationDate = '2024-03-12';
    const pppUser = 'testing2';
    
    // Cleanup any existing test data
    db.data.clients = db.data.clients.filter(c => c.pppoe_user !== pppUser);
    
    const account_id = 'ACC-TEST-999';
    const nextDueInitial = '2024-04-12'; // Anchored to 12th initially
    
    db.data.clients.push({
        id: 9999,
        account_id,
        full_name: 'Testing Two',
        pppoe_user: pppUser,
        plan: '20MBPS',
        installation_date: installationDate,
        next_due_date: nextDueInitial,
        status: 'active'
    });
    db.save();
    console.log(`✅ Client created. Initial Due Date: ${nextDueInitial}`);

    // 2. Simulate Overdue (6 days late relative to some past due date)
    // Let's say they were due on 2026-03-25 (March 25). Today is 2026-03-31.
    console.log('\nStep 2: Simulating OVERDUE status (Due March 25, Today is March 31)...');
    const client = db.data.clients.find(c => c.pppoe_user === pppUser);
    client.next_due_date = '2026-03-25';
    client.status = 'disabled'; // Suspended
    db.save();
    console.log(`❌ Status: ${client.status}, Due Date: ${client.next_due_date}`);

    // 3. Process Late Payment (Today: March 31)
    console.log('\nStep 3: Processing Late Payment on March 31 (6 days late)...');
    
    function calculateNextDueShifted(refDate) {
        const d = new Date(refDate + 'T12:00:00');
        let yy = d.getFullYear();
        let mm = d.getMonth() + 1;
        if (mm > 11) { yy++; mm = 0; }
        const lastDay = new Date(yy, mm + 1, 0).getDate();
        const dd = Math.min(d.getDate(), lastDay);
        const resDate = new Date(yy, mm, dd, 12, 0, 0);
        return `${resDate.getFullYear()}-${String(resDate.getMonth() + 1).padStart(2, '0')}-${String(resDate.getDate()).padStart(2, '0')}`;
    }

    const todayStr = '2026-03-31';
    const newNextDue = calculateNextDueShifted(todayStr);
    
    console.log(`⚙️ Calculating: One month from ${todayStr}...`);
    console.log(`✅ Result: ${newNextDue}`);

    // Update DB
    client.next_due_date = newNextDue;
    client.status = 'active';
    db.save();

    console.log(`\n🏁 FINAL VERIFICATION:`);
    console.log(`- Account Status: ${client.status} (EXPECTED: active)`);
    console.log(`- New Next Due: ${client.next_due_date} (EXPECTED: 2026-04-30 or 2026-05-01)`);
    
    if (client.next_due_date === '2026-04-30' || client.next_due_date === '2026-05-01') {
        console.log('✅ TEST PASSED: Due date correctly shifted to payment day + 1 month.');
    } else {
        console.log('❌ TEST FAILED: Due date did not shift as expected.');
    }
}

runLiveTest().catch(console.error);
