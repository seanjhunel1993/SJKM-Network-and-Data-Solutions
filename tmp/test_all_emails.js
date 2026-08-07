const { sendEmail } = require('../utils/email');
const templates = require('../utils/emailTemplates');

const target = 'joshualimbaga07@gmail.com';

async function testAll() {
    console.log('🚀 Sending all email templates to:', target);
    
    const list = [
        { name: 'Application Received', t: templates.applicationReceived('Joshua Limbaga', 'APP-1234') },
        { name: 'Application Approved', t: templates.applicationApproved('Joshua Limbaga', 'Approved by Joshua') },
        { name: 'Installation Scheduled', t: templates.installationScheduled('Joshua Limbaga', '2026-05-01', 'Technician will arrive at 9 AM') },
        { name: 'Payment Received', t: templates.paymentReceived('Joshua Limbaga', 1500, 'GCash', '2026-04-28', 'ACC-5678') },
        { name: 'Service Restored', t: templates.serviceRestored('Joshua Limbaga', '28th') },
        { name: 'Service Suspended', t: templates.serviceSuspended('Joshua Limbaga', 'ACC-5678') },
        { name: 'Billing Reminder', t: templates.billingReminder('Joshua Limbaga', 1500, '2026-05-28', 'ACC-5678') },
        { name: 'Welcome Account Ready', t: templates.welcomeWithCredentials('Joshua Limbaga', 'ACC-0042', 'isp_secret_99', 'Premium 50Mbps') },
        { name: 'Admin Alert', t: templates.adminAlert('High Latency Detected', '#f59e0b', 'The primary uplink is showing signs of congestion.', 'System Watchdog', '10.0.0.1', '2026-04-28') }
    ];

    for (const item of list) {
        console.log(`- Queuing: ${item.name}`);
        await sendEmail(target, `[TEST] ${item.name}`, item.t.text, item.t.html);
    }

    console.log('✅ All emails queued. Waiting for delivery...');
    
    // Wait for the background worker to finish
    const emailHelper = require('../utils/email');
    while (emailHelper.EMAIL_QUEUE.length > 0 || emailHelper.getStatus()) {
        await new Promise(r => setTimeout(r, 1000));
    }

    console.log('🏁 All emails processed.');
    process.exit(0);
}

testAll();
