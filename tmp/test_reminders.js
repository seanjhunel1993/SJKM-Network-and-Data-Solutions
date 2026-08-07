/**
 * BILLING REMINDER TEST SCRIPT
 * 
 * This manually tests the automated email reminder system.
 * Run: node tmp/test_reminders.js
 */
const db     = require('../database');
const { sendEmail } = require('../utils/email');

async function testReminders() {
    console.log('\n==============================');
    console.log('  BILLING REMINDER TEST TOOL');
    console.log('==============================\n');

    // 1. Load settings
    const settings = db.prepare('SELECT * FROM settings LIMIT 1').get() || {};
    console.log('📋 Current Settings:');
    console.log(`   Company Name    : ${settings.company_name || '(not set)'}`);
    console.log(`   Support Email   : ${settings.support_email || '(not set)'}`);
    console.log(`   Early Reminder  : ${settings.reminder_1_days || 15} days`);
    console.log(`   Final Reminder  : ${settings.reminder_2_days || 2} days`);
    console.log(`   Grace Period    : ${settings.grace_period || 3} days`);
    console.log('');

    // 2. Load clients
    const clients = db.data.clients || [];
    console.log(`👥 Total Clients: ${clients.length}`);

    // Find a client with email
    const testClient = clients.find(c => c.email && c.email.includes('@'));
    if (!testClient) {
        console.log('❌ No client with a valid email found. Please add a client email first.');
        process.exit(1);
    }

    console.log(`\n✉️  Test Client: ${testClient.full_name} <${testClient.email}>`);
    console.log(`   Current Due Date: ${testClient.next_due_date}`);
    console.log(`   Status: ${testClient.status}`);
    console.log('');

    // 3. Check what SMTP is configured
    const smtp_host = process.env.SMTP_HOST || process.env.EMAIL_HOST || '(not configured)';
    const smtp_user = process.env.SMTP_USER || process.env.EMAIL_USER || '(not configured)';
    console.log('📡 SMTP Configuration:');
    console.log(`   Host: ${smtp_host}`);
    console.log(`   User: ${smtp_user}`);
    console.log('');

    // 4. Send a test email directly
    console.log('📧 Sending test reminder email...');

    const COMPANY = settings.company_name || 'ISP Monitoring System';
    const html = `
    <div style="font-family:'Inter',sans-serif;max-width:600px;margin:0 auto;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
        <div style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:32px;text-align:center;color:white;">
            <h1 style="margin:0;font-size:24px;font-weight:800;">${COMPANY}</h1>
            <p style="margin:8px 0 0;opacity:0.85;">🧪 Test Reminder Email</p>
        </div>
        <div style="padding:32px;background:white;">
            <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:16px;margin-bottom:20px;">
                <strong style="color:#166534;">✅ Your automated billing reminders are working correctly!</strong>
            </div>
            <h2 style="color:#1e293b;">Hello, ${testClient.full_name}!</h2>
            <p style="color:#475569;line-height:1.6;">
                This is a <strong>test email</strong> sent from your ISP Monitoring System to verify that 
                email delivery is functioning correctly.
            </p>
            <table style="width:100%;border-collapse:collapse;background:#f8fafc;border-radius:8px;padding:16px;margin:20px 0;">
                <tr><td style="padding:8px;color:#64748b;">Client</td><td style="padding:8px;font-weight:600;text-align:right">${testClient.full_name}</td></tr>
                <tr><td style="padding:8px;color:#64748b;">Plan</td><td style="padding:8px;font-weight:600;text-align:right">${testClient.plan || 'N/A'}</td></tr>
                <tr><td style="padding:8px;color:#64748b;">Due Date</td><td style="padding:8px;font-weight:600;color:#6366f1;text-align:right">${testClient.next_due_date}</td></tr>
                <tr><td style="padding:8px;color:#64748b;">Grace Period</td><td style="padding:8px;font-weight:600;text-align:right">${settings.grace_period || 3} days after due</td></tr>
            </table>
            <p style="color:#94a3b8;font-size:13px;">Sent by the automated billing scheduler. You can safely ignore this.</p>
        </div>
        <div style="background:#f1f5f9;padding:20px;text-align:center;color:#94a3b8;font-size:12px;">
            &copy; ${new Date().getFullYear()} ${COMPANY}. All rights reserved.
        </div>
    </div>`;

    const result = await sendEmail(
        testClient.email,
        `[TEST] ${COMPANY} — Billing Reminder System Check`,
        `Test reminder from ${COMPANY}. Your billing reminders are active.`,
        html
    );

    if (result.success) {
        console.log(`✅ SUCCESS! Test email sent to ${testClient.email}`);
        console.log('\n🎉 Your reminder system is working correctly.');
        console.log('   Emails will be sent automatically every day at 12:00 AM.');
    } else {
        console.log(`❌ FAILED: ${result.error || result.message}`);
        console.log('\n💡 Fix: Check your SMTP settings in the .env file:');
        console.log('   SMTP_HOST=smtp.gmail.com');
        console.log('   SMTP_PORT=587');
        console.log('   SMTP_USER=your@gmail.com');
        console.log('   SMTP_PASS=your-app-password');
    }

    console.log('\n==============================\n');
}

testReminders().catch(err => {
    console.error('Script error:', err.message);
});
