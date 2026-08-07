const { sendEmail } = require('../utils/email.js');
const { serviceSuspended } = require('../utils/emailTemplates.js');

(async () => {
  try {
    const template = serviceSuspended('Joshua Limbaga', 'ACC-5678');
    const result = await sendEmail(
      'joshualimbaga07@gmail.com', 
      '[TEST] Service Suspended', 
      template.text, 
      template.html
    );
    console.log('Sending test email queued:', result);

    setTimeout(() => {
        console.log('Finished waiting for queue processor to send email');
        process.exit(0);
    }, 5000);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
})();
