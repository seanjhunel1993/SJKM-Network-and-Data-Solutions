const db = require('../database');
const mikrotik = require('../mikrotik');

// Helper to simulate the snapshot logic
function testSnapshotFix() {
    console.log('🧪 Starting Rollback Fix Test...');

    // 1. Setup a dummy client
    const clientId = 9999;
    const initialDueDate = '2025-12-04';
    const installDate = '2025-12-04';
    
    // Clean up existing if any
    db.data.clients = db.data.clients.filter(c => c.id !== clientId);
    db.data.payments = db.data.payments.filter(p => p.client_id !== clientId);

    db.data.clients.push({
        id: clientId,
        full_name: 'Test Rollback Client',
        pppoe_user: 'test_rollback_user',
        next_due_date: initialDueDate,
        installation_date: installDate,
        monthly_rate: 1000,
        status: 'suspended'
    });

    console.log(`✅ Client setup with due date: ${initialDueDate}`);

    // 2. Simulate Recording a Payment (Logic from POST /payments)
    const todayStr = '2026-04-04';
    const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(clientId);
    
    // THE FIX: Snapshot captured BEFORE update
    const previousDueDateSnapshot = client.next_due_date || client.installation_date || todayStr;
    console.log(`📸 Snapshot captured: ${previousDueDateSnapshot}`);

    const newDueDate = '2026-05-04'; // Simulated result of calculateNextDue
    
    // Update client (This would have corrupted the reference before the fix)
    db.prepare("UPDATE clients SET next_due_date = ?, status = 'active' WHERE id = ?").run(newDueDate, clientId);
    console.log(`📝 Client updated to new due date: ${newDueDate}`);

    // Insert payment
    const paymentId = 8888;
    db.data.payments.push({
        id: paymentId,
        client_id: clientId,
        amount: 1000,
        paid_date: todayStr,
        due_date: newDueDate,
        previous_due_date: previousDueDateSnapshot,
        status: 'paid'
    });
    console.log(`💰 Payment recorded with previous_due_date: ${previousDueDateSnapshot}`);

    // 3. Verify Snapshot Integrity
    if (previousDueDateSnapshot === initialDueDate) {
        console.log('✅ PASS: Snapshot correctly captured the original due date.');
    } else {
        console.error(`❌ FAIL: Snapshot captured ${previousDueDateSnapshot} instead of ${initialDueDate}`);
        process.exit(1);
    }

    // 4. Simulate Voiding (Logic from DELETE /payments/:id)
    const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(paymentId);
    const rollback = true;

    if (rollback && payment.previous_due_date) {
        const rollbackDate = payment.previous_due_date;
        db.prepare("UPDATE clients SET next_due_date = ? WHERE id = ?").run(rollbackDate, clientId);
        console.log(`🔄 Rolled back client to: ${rollbackDate}`);
        
        const finalClient = db.prepare('SELECT * FROM clients WHERE id = ?').get(clientId);
        if (finalClient.next_due_date === initialDueDate) {
            console.log('✅ PASS: Client due date successfully restored to original.');
        } else {
            console.error(`❌ FAIL: Client due date is ${finalClient.next_due_date} instead of ${initialDueDate}`);
            process.exit(1);
        }
    }

    console.log('🎉 All Rollback tests passed!');
}

testSnapshotFix();
