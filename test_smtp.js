require('dotenv').config();
const nodemailer = require('nodemailer');

async function testSmtp() {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  console.log('Testing SMTP with User:', user, 'Pass:', pass);

  try {
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user, pass }
    });

    await transporter.verify();
    console.log('SMTP Config is Valid!');
  } catch (error) {
    console.error('SMTP Error:', error.message);
  }
}

testSmtp();
