/**
 * ALL-IN-ONE REMINDER TEST
 * Tests all 5 email types in a single run using saved settings.
 * Run: node tmp/test_all_reminders.js
 */
require('dotenv').config();
const db          = require('../database');
const { sendEmail } = require('../utils/email');

async function run() {
    const settings = db.prepare('SELECT * FROM settings LIMIT 1').get() || {};
    const COMPANY  = settings.company_name || 'ISP Monitoring';
    const GRACE    = parseInt(settings.grace_period)    || 3;
    const REM1     = parseInt(settings.reminder_1_days) || 15;
    const REM2     = parseInt(settings.reminder_2_days) || 2;

    const client = db.data.clients.find(c => c.email && c.email.includes('@'));
    if (!client) {
        console.log('❌ No client with a valid email found.');
        return;
    }

    console.log('\n╔══════════════════════════════════════╗');
    console.log('║     FULL REMINDER TEST SUITE         ║');
    console.log('╚══════════════════════════════════════╝');
    console.log(`  Company : ${COMPANY}`);
    console.log(`  Client  : ${client.full_name} <${client.email}>`);
    console.log(`  Config  : ${REM1}d Early → ${REM2}d Final → Due → ${GRACE}d Grace`);
    console.log('');

    const today = new Date();
    const dateStr = (d) => d.toISOString().split('T')[0];
    const offset  = (days) => { const d = new Date(today); d.setDate(d.getDate() + days); return d; };

    const tests = [
        {
            label: `📅 Early Reminder (${REM1} days before due)`,
            fakeDue: dateStr(offset(REM1)),
            dueText: `in ${REM1} days`,
            subject: `📅 [TEST] Early Reminder: ${COMPANY} Bill due in ${REM1} days`,
            color: '#6366f1',
            alert: ''
        },
        {
            label: `⚠️  Final Reminder (${REM2} days before due)`,
            fakeDue: dateStr(offset(REM2)),
            dueText: `in ${REM2} days`,
            subject: `⚠️ [TEST] Final Reminder: ${COMPANY} Bill due in ${REM2} days`,
            color: '#f59e0b',
            alert: ''
        },
        {
            label: '🔔 Due Today',
            fakeDue: dateStr(today),
            dueText: 'TODAY',
            subject: `🔔 [TEST] Due Today: ${COMPANY} Bill is due NOW`,
            color: '#ef4444',
            alert: ''
        },
        {
            label: `❗ Grace Period — Day 1/${GRACE}`,
            fakeDue: dateStr(offset(-1)),
            dueText: 'PAST DUE',
            subject: `❗ [TEST] ${COMPANY}: Grace Period Started (Day 1/${GRACE})`,
            color: '#ef4444',
            alert: `<div style="background:#fee2e2;border:1px solid #fca5a5;border-radius:8px;padding:14px;margin-bottom:16px;"><strong style="color:#b91c1c;">⚠️ Grace Period Has Started</strong><br><span style="color:#991b1b;font-size:13px;">You have ${GRACE} days before automatic disconnection.</span></div>`
        },
        {
            label: `🚨 Final Grace Warning — Day ${GRACE}/${GRACE}`,
            fakeDue: dateStr(offset(-(GRACE - 1))),
            dueText: 'PAST DUE',
            subject: `🚨 [TEST] FINAL WARNING: ${COMPANY} Disconnection Today`,
            color: '#ef4444',
            alert: `<div style="background:#fef2f2;border:2px solid #ef4444;border-radius:8px;padding:14px;margin-bottom:16px;"><strong style="color:#991b1b;font-size:15px;">🚨 FINAL NOTICE</strong><br><span style="color:#b91c1c;font-size:13px;">This is your last day of grace. Service disconnects tonight if payment is not received.</span></div>`
        }
    ];

    let passed = 0;
    let failed = 0;

    for (const t of tests) {
        process.stdout.write(`  ${t.label.padEnd(48)} → `);

        const html = `
        <div style="font-family:'Inter',sans-serif;max-width:600px;margin:0 auto;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
            <div style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:24px 32px;text-align:center;color:white;">
                <div style="font-size:10px;background:rgba(255,255,255,0.2);display:inline-block;padding:2px 10px;border-radius:20px;margin-bottom:8px;">🧪 TEST EMAIL</div>
                <h1 style="margin:0;font-size:20px;font-weight:800;">${COMPANY}</h1>
                <p style="margin:4px 0 0;opacity:0.85;font-size:13px;">${t.label}</p>
            </div>
            <div style="padding:24px 32px;background:white;">
                ${t.alert}
                <h2 style="color:#1e293b;margin:0 0 8px;font-size:18px;">Hello, ${client.full_name}!</h2>
                <p style="color:#475569;line-height:1.6;margin-bottom:18px;">
                    This is a <strong>test email</strong> for the <strong>${t.label}</strong> notification.<br>
                    Simulated due date: <strong style="color:${t.color};">${t.fakeDue}</strong>
                </p>
                <table style="width:100%;border-collapse:collapse;background:#f8fafc;border-radius:8px;overflow:hidden;margin-bottom:18px;">
                    <tr style="border-bottom:1px solid #e2e8f0;"><td style="padding:9px 14px;color:#64748b;font-size:13px;">Client</td><td style="padding:9px 14px;font-weight:600;text-align:right;">${client.full_name}</td></tr>
                    <tr style="border-bottom:1px solid #e2e8f0;"><td style="padding:9px 14px;color:#64748b;font-size:13px;">Plan</td><td style="padding:9px 14px;font-weight:600;text-align:right;">${client.plan || 'N/A'}</td></tr>
                    <tr><td style="padding:9px 14px;color:#64748b;font-size:13px;">Due Date</td><td style="padding:9px 14px;font-weight:700;color:${t.color};text-align:right;">${t.fakeDue}</td></tr>
                </table>
                <div style="text-align:center;">
                    <a href="#" style="display:inline-block;background:#6366f1;color:white;padding:11px 26px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;">Open Customer Portal</a>
                </div>
            </div>
            <div style="background:#f1f5f9;padding:14px 32px;text-align:center;">
                <p style="margin:0;color:#94a3b8;font-size:11px;">TEST ONLY — No action needed. &copy; ${new Date().getFullYear()} ${COMPANY}</p>
            </div>
        </div>`;

        const result = await sendEmail(client.email, t.subject, 'Test billing reminder.', html);

        if (result.success && !result.mocked) {
            console.log('✅ SENT');
            passed++;
        } else if (result.mocked) {
            console.log('⚠️  MOCK (SMTP not set)');
            failed++;
        } else {
            console.log(`❌ FAILED — ${result.error}`);
            failed++;
        }
    }

    console.log('');
    console.log(`╔══════════════════════════════════════╗`);
    console.log(`║  Results: ${passed}/5 sent ✅  ${failed > 0 ? failed + '/5 failed ❌' : 'All passed! 🎉'}`.padEnd(44) + '║');
    console.log(`╚══════════════════════════════════════╝`);
    console.log(`\n  📬 Check your inbox: ${client.email}\n`);
}

run().catch(err => console.error('Error:', err.message));
