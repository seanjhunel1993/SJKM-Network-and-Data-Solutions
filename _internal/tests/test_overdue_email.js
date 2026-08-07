require('dotenv').config();
const { sendEmail } = require('./utils/email');
const emailTemplates = require('./utils/emailTemplates');

const testClient = {
  full_name: 'Joshua Limbaga',
  plan: 'Premium 30Mbps',
  monthly_rate: 1199
};

const toEmail = 'joshualimbaga07@gmail.com';

async function sendTestEmails() {
  console.log('Sending overdue test emails to', toEmail, '...\n');

  // Test 1 - 1 day overdue
  const msg1 = `Your account is now <strong>1 day past due</strong>. This is a gentle reminder to settle your monthly subscription to avoid service interruption. Please pay at your earliest convenience.`;
  const t1 = emailTemplates.paymentReminder(testClient.full_name, testClient.plan, testClient.monthly_rate, msg1, 'overdue');
  const r1 = await sendEmail(toEmail, '[TEST] Overdue Day 1 - JKL Internet Billing Notice', t1.text, t1.html);
  console.log('Day 1 overdue:', r1.success ? '✅ Sent!' : '❌ Failed: ' + r1.error);

  await new Promise(r => setTimeout(r, 2000));

  // Test 2 - 3 days overdue
  const msg3 = `Your account is <strong>3 days overdue</strong>. We have not yet received your payment. To protect your internet connection, please settle your balance as soon as possible. Continued non-payment may result in a temporary service suspension.`;
  const t3 = emailTemplates.paymentReminder(testClient.full_name, testClient.plan, testClient.monthly_rate, msg3, 'overdue');
  const r3 = await sendEmail(toEmail, '[TEST] Overdue Day 3 - JKL Internet Billing Notice', t3.text, t3.html);
  console.log('Day 3 overdue:', r3.success ? '✅ Sent!' : '❌ Failed: ' + r3.error);

  await new Promise(r => setTimeout(r, 2000));

  // Test 3 - 7 days overdue (FINAL NOTICE)
  const msg7 = `<strong>⚠️ FINAL NOTICE — Your account is 7 days overdue.</strong><br><br>
Your internet subscription has not been paid for 7 days. As a result, your account has been <strong>flagged for disconnection</strong>. 
To restore your internet service immediately, please contact us and settle your outstanding balance.<br><br>
<em>Note: This is an email notification only. To reconnect your service, please contact our support team or visit our office.</em>`;
  const t7 = emailTemplates.paymentReminder(testClient.full_name, testClient.plan, testClient.monthly_rate, msg7, 'overdue');
  const r7 = await sendEmail(toEmail, '[TEST] FINAL NOTICE Day 7 - JKL Internet Disconnection Warning', t7.text, t7.html);
  console.log('Day 7 FINAL NOTICE:', r7.success ? '✅ Sent!' : '❌ Failed: ' + r7.error);

  console.log('\nDone! Check your inbox at', toEmail);
}

sendTestEmails().catch(console.error);
