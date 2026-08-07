const db = require('../database');
const { sendEmail } = require('../utils/email');
const { sendSMS } = require('../utils/sms');
const templates = require('../utils/emailTemplates');

/**
 * 🧪 NOTIFICATION TESTER
 * Run this to see how the reminders look on your devices.
 */
async function runTest() {
    // 📝 EDIT THESE DETAILS
    const TEST_EMAIL = '@gmail.com'; // Change this
    const TEST_PHONE = '0578880';      // Change this
    const TEST_NAME = 'JOSHUA LIMBAGA';
    const TEST_AMOUNT = 500;
    const TEST_DUE_DATE = new Date();
    TEST_DUE_DATE.setDate(TEST_DUE_DATE.getDate() + 7);
    const formattedDate = TEST_DUE_DATE.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const dueDateStr = TEST_DUE_DATE.toISOString().split('T')[0];

    console.log('🚀 Starting Notification Test...');

    // 1. Test 7-Day Email
    console.log('\n--- Testing 7-Day Email ---');
    const email7 = templates.billingReminder(TEST_NAME, TEST_AMOUNT, dueDateStr, 'ACC-TEST', 7);
    await sendEmail(TEST_EMAIL, 'Upcoming Payment Reminder (TEST)', email7.text, email7.html);

    // 2. Test 7-Day SMS
    console.log('\n--- Testing 7-Day SMS ---');
    const sms7 = `PAYMENT REMINDER\n\nHi ${TEST_NAME},\nYour internet bill is coming up.\n\n📅 Due Date: ${formattedDate} (In 7 Days)\n💰 Amount: ₱${TEST_AMOUNT.toLocaleString()}\n⚠️ Status: UPCOMING\n\nPlease pay via GCash/Maya to keep your connection active.`;
    await sendSMS(TEST_PHONE, sms7, TEST_NAME);

    // 3. Test Due Today Email
    console.log('\n--- Testing Due Today Email ---');
    const email0 = templates.billingReminder(TEST_NAME, TEST_AMOUNT, new Date().toISOString().split('T')[0], 'ACC-TEST', 0);
    await sendEmail(TEST_EMAIL, 'PAYMENT REMINDER', email0.text, email0.html);

    // 4. Test Due Today SMS
    console.log('\n--- Testing Due Today SMS ---');
    const sms0 = `PAYMENT DUE TODAY\n\nHi ${TEST_NAME},\nYour internet subscription is due today.\n\n📅 Due Date: TODAY (${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })})\n💰 Amount: ₱${TEST_AMOUNT.toLocaleString()}\n⚠️ Status: DUE NOW\n\nPlease settle your payment today to avoid auto-disconnection.`;
    await sendSMS(TEST_PHONE, sms0, TEST_NAME);

    console.log('\n✅ Test triggers complete. Check your Email and Phone!');
    process.exit(0);
}

runTest().catch(err => {
    console.error('❌ Test failed:', err);
    process.exit(1);
});
