/**
 * ONE-BY-ONE REMINDER TEST
 * 
 * Tests each email type by simulating the exact due date scenario.
 * Run: node tmp/test_each_reminder.js [TYPE]
 * 
 * Types:
 *   15day      - Early reminder (15 days before due)
 *   2day       - Final reminder (2 days before due)
 *   duetoday   - Due today notice
 *   grace1     - Grace period Day 1 (overdue)
 *   gracefinal - Final grace warning (last day before disconnect)
 */

require('dotenv').config();
const db          = require('../database');
const { sendEmail } = require('../utils/email');

// ── Get the type from command line arg ──────────────────────────────
const TYPE = (process.argv[2] || '').toLowerCase();

const TYPES = ['15day', '2day', 'duetoday', 'grace1', 'gracefinal'];

if (!TYPE || !TYPES.includes(TYPE)) {
    console.log('\n❌ Please specify a test type:');
    console.log('');
    TYPES.forEach(t => console.log(`   node tmp/test_each_reminder.js ${t}`));
    console.log('');
    process.exit(1);
}

// ── Load settings & client ──────────────────────────────────────────
const settings    = db.prepare('SELECT * FROM settings LIMIT 1').get() || {};
const COMPANY     = settings.company_name || 'ISP Monitoring';
const GRACE       = parseInt(settings.grace_period)    || 3;
const REM1        = parseInt(settings.reminder_1_days) || 15;
const REM2        = parseInt(settings.reminder_2_days) || 2;

// Find a client with email
const client = db.data.clients.find(c => c.email && c.email.includes('@'));

if (!client) {
    console.log('❌ No client with a valid email found in the database.');
    process.exit(1);
}

// ── Compute a fake due date to simulate the scenario ───────────────
const now     = new Date();
let fakeDue   = new Date(now);
let daysLabel = '';
let typeLabel = '';
let emailSubject = '';
let days      = 'today';

switch (TYPE) {
    case '15day':
        fakeDue.setDate(fakeDue.getDate() + REM1);
        daysLabel = `${REM1} days from now`;
        typeLabel = `📅 Early Reminder (${REM1} days before due)`;
        emailSubject = `📅 [TEST] Early Reminder: ${COMPANY} Bill due in ${REM1} days`;
        days = REM1;
        break;
    case '2day':
        fakeDue.setDate(fakeDue.getDate() + REM2);
        daysLabel = `${REM2} days from now`;
        typeLabel = `⚠️ Final Reminder (${REM2} days before due)`;
        emailSubject = `⚠️ [TEST] Final Reminder: ${COMPANY} Bill due in ${REM2} days`;
        days = REM2;
        break;
    case 'duetoday':
        daysLabel = 'today';
        typeLabel = '🔔 Due Today';
        emailSubject = `🔔 [TEST] Account Due: ${COMPANY} Bill is due TODAY`;
        days = 'today';
        break;
    case 'grace1':
        fakeDue.setDate(fakeDue.getDate() - 1);
        daysLabel = 'yesterday (1 day overdue)';
        typeLabel = `❗ Grace Period – Day 1/${GRACE}`;
        emailSubject = `❗ [TEST] ${COMPANY}: Grace Period Started (Day 1/${GRACE})`;
        days = 'overdue_1';
        break;
    case 'gracefinal':
        fakeDue.setDate(fakeDue.getDate() - (GRACE - 1));
        daysLabel = `${GRACE - 1} days ago (last grace day)`;
        typeLabel = `🚨 Grace Final Warning (Day ${GRACE}/${GRACE})`;
        emailSubject = `🚨 [TEST] FINAL WARNING: ${COMPANY} Disconnection Today`;
        days = 'overdue_final';
        break;
}

const fakeDueStr = fakeDue.toISOString().split('T')[0];

// ── Build the test email HTML ──────────────────────────────────────
const highlightColor = (days === 'today' || days === 'overdue_1' || days === 'overdue_final')
    ? '#ef4444' : '#6366f1';

const dueText = days === 'today' ? 'TODAY'
    : (days === 'overdue_1' || days === 'overdue_final') ? 'PAST DUE'
    : `in ${days} days`;

let graceAlert = '';
if (days === 'overdue_1') {
    graceAlert = `<div style="background:#fee2e2;border:1px solid #fca5a5;border-radius:8px;padding:14px;margin-bottom:16px;">
        <strong style="color:#b91c1c;">⚠️ Grace Period Has Started</strong><br>
        <span style="color:#991b1b;font-size:13px;">You have ${GRACE} days before automatic disconnection.</span>
    </div>`;
} else if (days === 'overdue_final') {
    graceAlert = `<div style="background:#fef2f2;border:2px solid #ef4444;border-radius:8px;padding:14px;margin-bottom:16px;">
        <strong style="color:#991b1b;font-size:15px;">🚨 FINAL NOTICE</strong><br>
        <span style="color:#b91c1c;font-size:13px;">This is your last day of grace. Service disconnects tonight if payment is not received.</span>
    </div>`;
}

const html = `
<div style="font-family:'Inter',sans-serif;max-width:600px;margin:0 auto;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
    <div style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:28px 32px;text-align:center;color:white;">
        <div style="font-size:11px;background:rgba(255,255,255,0.2);display:inline-block;padding:3px 12px;border-radius:20px;margin-bottom:10px;letter-spacing:1px;">🧪 TEST EMAIL</div>
        <h1 style="margin:0;font-size:22px;font-weight:800;">${COMPANY}</h1>
        <p style="margin:6px 0 0;opacity:0.85;font-size:14px;">${typeLabel}</p>
    </div>
    <div style="padding:28px 32px;background:white;">
        ${graceAlert}
        <h2 style="color:#1e293b;margin:0 0 10px;">Hello, ${client.full_name}!</h2>
        <p style="color:#475569;line-height:1.6;margin-bottom:20px;">
            This is a <strong>test email</strong> simulating the <strong>${typeLabel}</strong> notification.<br>
            Your bill is due <strong style="color:${highlightColor};">${dueText}</strong> — simulated date: <code>${fakeDueStr}</code>
        </p>
        <table style="width:100%;border-collapse:collapse;background:#f8fafc;border-radius:8px;overflow:hidden;margin-bottom:20px;">
            <tr style="border-bottom:1px solid #e2e8f0;">
                <td style="padding:10px 14px;color:#64748b;font-size:13px;">Client</td>
                <td style="padding:10px 14px;font-weight:600;text-align:right;">${client.full_name}</td>
            </tr>
            <tr style="border-bottom:1px solid #e2e8f0;">
                <td style="padding:10px 14px;color:#64748b;font-size:13px;">Service Plan</td>
                <td style="padding:10px 14px;font-weight:600;text-align:right;">${client.plan || 'N/A'}</td>
            </tr>
            <tr style="border-bottom:1px solid #e2e8f0;">
                <td style="padding:10px 14px;color:#64748b;font-size:13px;">Monthly Rate</td>
                <td style="padding:10px 14px;font-weight:600;text-align:right;">₱${client.monthly_rate || 0}</td>
            </tr>
            <tr>
                <td style="padding:10px 14px;color:#64748b;font-size:13px;">Due Date (Simulated)</td>
                <td style="padding:10px 14px;font-weight:700;text-align:right;color:${highlightColor};">${fakeDueStr}</td>
            </tr>
        </table>
        <div style="text-align:center;">
            <a href="#" style="display:inline-block;background:#6366f1;color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;">Open Customer Portal</a>
        </div>
    </div>
    <div style="background:#f1f5f9;padding:18px 32px;text-align:center;">
        <p style="margin:0;color:#64748b;font-size:11px;">This is a TEST email. No action required. &copy; ${new Date().getFullYear()} ${COMPANY}</p>
    </div>
</div>`;

// ── Send it ────────────────────────────────────────────────────────
async function run() {
    console.log('\n================================');
    console.log(`  TEST: ${typeLabel}`);
    console.log('================================');
    console.log(`  Client   : ${client.full_name} <${client.email}>`);
    console.log(`  Scenario : Bill due ${daysLabel}`);
    console.log(`  Fake Due : ${fakeDueStr}`);
    console.log(`  Company  : ${COMPANY}`);
    console.log('  Sending email...\n');

    const result = await sendEmail(client.email, emailSubject, 'Test reminder email.', html);

    if (result.success && !result.mocked) {
        console.log(`✅ DELIVERED to ${client.email}`);
        console.log('   Check your Gmail inbox now.');
    } else if (result.mocked) {
        console.log('⚠️  MOCK (not actually sent) — SMTP not configured.');
    } else {
        console.log(`❌ FAILED: ${result.error}`);
    }

    console.log('\n================================\n');
}

run().catch(err => console.error('Error:', err.message));
