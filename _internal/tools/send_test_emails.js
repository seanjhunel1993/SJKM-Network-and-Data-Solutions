/**
 * sjkm INTERNET - SCRIPT TO SEND ALL EMAIL TEMPLATES FOR REVIEW
 */
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const { sendEmail } = require('../../utils/email');
const templates = require('../../utils/emailTemplates');

const TARGET_EMAIL = 'sjkmsolutions@gmail.com'; 

async function sendAllTests() {
  console.log(`🚀 Sending all Premium Light templates to ${TARGET_EMAIL}...`);

  const tests = [
    { name: '1. Application Received', data: templates.applicationReceived('John Doe', 'ACC-12345') },
    { name: '2. Application Approved', data: templates.applicationApproved('John Doe', 'Your installation is scheduled for tomorrow.') },
    { name: '3. Application Rejected', data: templates.applicationRejected('John Doe', 'Service not available in your area.') },
    { name: '4. Payment Received (Receipt)', data: templates.paymentReceived('John Doe', 1500, 'GCash', '2026-04-09', 'ACC-12345', '2026-05-09') },
    { name: '5. Service Restored', data: templates.restatutionConfirmed('John Doe', 9) },
    { name: '6. Billing Reminder', data: templates.billingReminder('John Doe', 1500, '2026-04-12', 'ACC-12345') },
    { name: '7. Support Ticket Reply', data: templates.ticketReplied('John Doe', 'Slow Connection', 'Our team has optimized your line. Please check again.') },
    { name: '8. System Announcement', data: templates.getBroadCastTemplate('John Doe', 'Maintenance scheduled for tonight at 12 AM.') },
    { name: '9. Admin Alert', data: templates.adminAlert('High Latency Detected', '#ef4444', 'Latency on OLT-1 exceeds 100ms.', 'SYSTEM', '127.0.0.1', new Date().toLocaleString()) }
  ];

  for (const test of tests) {
    console.log(`📡 Sending [${test.name}]...`);
    const res = await sendEmail(TARGET_EMAIL, `[TEMPLATE REVIEW] ${test.name}`, test.data.text, test.data.html);
    if (res.success) {
      console.log(`✅ Sent ${test.name}`);
    } else {
      console.error(`❌ Failed to send ${test.name}: ${res.error}`);
    }
  }

  console.log('✅ ALL TEST EMAILS SENT SUCCESSFULLY!');
}

sendAllTests();
