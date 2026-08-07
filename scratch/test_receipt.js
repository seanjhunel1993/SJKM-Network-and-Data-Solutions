const db = require('../database');
const { sendEmail } = require('../utils/email');
const templates = require('../utils/emailTemplates');

async function testReceipt() {
    const client = db.prepare('SELECT * FROM clients WHERE full_name LIKE ?').get('%joshua%');
    if (!client) {
        console.error('Joshua not found');
        process.exit(1);
    }

    console.log('Testing receipt for:', client.full_name, 'Email:', client.email);

    const emailContent = templates.paymentReceived(
        client.full_name,
        500,
        'Cash',
        new Date().toISOString().split('T')[0],
        client.account_id,
        '2026-06-11'
    );

    console.log('Template created. Text length:', emailContent.text.length, 'HTML length:', emailContent.html.length);

    try {
        const res = await sendEmail(client.email, '💰 Payment Confirmed - Thank You', emailContent.text, emailContent.html);
        console.log('Result:', res);
    } catch (e) {
        console.error('Error:', e.message);
    }

    setTimeout(() => {
        console.log('Waiting for queue...');
        process.exit(0);
    }, 5000);
}

testReceipt();
