const nodemailer = require('nodemailer');
const db = require('../database');
require('dotenv').config();

// 🛡️ [CRITICAL] Force all DNS lookups to prefer IPv4 — prevents ENETUNREACH on IPv6 addresses
require('dns').setDefaultResultOrder('ipv4first');


let cachedTransporter = null;
let resolvedSmtpIp = null;

/**
 * 🔒 Hard-forces IPv4 resolution for Gmail
 */
const getSmtpIp = async () => {
    if (resolvedSmtpIp) return resolvedSmtpIp;
    try {
        const dns = require('dns').promises;
        const result = await dns.lookup('smtp.gmail.com', { family: 4 });
        resolvedSmtpIp = result.address;
        console.log(`[EMAIL] SMTP Host hardened to IPv4: ${resolvedSmtpIp}`);
        return resolvedSmtpIp;
    } catch (e) {
        return 'smtp.gmail.com'; // Fallback to hostname if DNS fails
    }
};

const getTransporter = async () => {
  if (cachedTransporter) return cachedTransporter;
  
  const targetHost = await getSmtpIp();
  
  cachedTransporter = nodemailer.createTransport({
    host: targetHost,
    port: 465,
    secure: true,
    servername: 'smtp.gmail.com', // 🛡️ Required for SSL when using IP
    auth: {
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || ''
    },
    family: 4,
    connectionTimeout: 30000,
    greetingTimeout: 30000,
    socketTimeout: 45000,
  });
  return cachedTransporter;
};

/**
 * ⚡ Helper: Sends a single email item
 * Throws error if failed so the worker can track status.
 */
const sendSingleItem = async (item) => {
  const { to, subject, text, html, attachments = [] } = item;

  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!user || !pass) {
    console.warn(`[EMAIL-MOCK] To: ${to} | Subject: ${subject}`);
    return;
  }

  // 🏢 Fetch dynamic branding
  let companyName = 'ISP Monitoring System';
  try {
    const settings = db.prepare('SELECT company_name FROM settings LIMIT 1').get();
    if (settings?.company_name) companyName = settings.company_name;
  } catch(e) {}

  // 🎨 Wrap content in professional template
  const brandedHtml = wrapInBrandedTemplate(html || text || '', companyName);

  // 🏢 Final Branded Subject
  const brandedSubject = subject.startsWith('[TEST]') 
    ? `[${companyName}] ${subject.replace('[TEST]', '').trim()}`
    : `${companyName}: ${subject}`;

  const transporter = await getTransporter();
  await transporter.sendMail({
    from: `"${companyName}" <${user}>`,
    to,
    subject: brandedSubject,
    text: text || 'HTML not supported',
    html: brandedHtml,
    attachments: attachments
  });

  console.log(`[EMAIL-QUEUE] Successfully delivered to ${to}: ${subject}`);
};



/**
 * 🎨 Professional HTML Email Wrapper (Executive SaaS Design)
 */
const wrapInBrandedTemplate = (content, companyName) => {
  const year = new Date().getFullYear();
  
  const words = companyName.split(' ');
  let mainPart = companyName;
  let subPart = '';
  if (words.length > 2) {
    mainPart = words.slice(0, 2).join(' ');
    subPart = words.slice(2).join(' ');
  }

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700&display=swap" rel="stylesheet">
      <style>
        body { margin: 0; padding: 0; background-color: #f6f9fc; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; -webkit-font-smoothing: antialiased; }
        .wrapper { width: 100%; table-layout: fixed; background-color: #f6f9fc; padding: 40px 0; }
        .main { background-color: #ffffff; margin: 0 auto; width: 100%; max-width: 580px; border-spacing: 0; border-radius: 8px; overflow: hidden; border: 1px solid #e6ebf1; }
        .top-bar { height: 4px; background-color: #2563eb; }
        .header { padding: 45px 40px 35px 40px; text-align: center; border-bottom: 1px solid #e6ebf1; }
        .brand { color: #2563eb; font-size: 20px; font-weight: 900; letter-spacing: 2px; text-transform: uppercase; text-shadow: 1px 1px 0 #fff, -1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff; }
        .content { padding: 40px; line-height: 1.6; color: #4f566b; font-size: 15px; }
        .footer { text-align: center; padding: 40px; font-size: 12px; color: #8898aa; line-height: 1.5; }
        
        .data-card { background-color: #f7fafc; border-radius: 6px; padding: 24px; margin: 24px 0; border: 1px solid #edf2f7; }
        .label { display: block; font-size: 11px; font-weight: 600; color: #a3acb9; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; }
        .value { display: block; font-size: 15px; font-weight: 600; color: #1a1f36; margin-bottom: 16px; }
        .value:last-child { margin-bottom: 0; }
        
        h2 { color: #1a1f36; font-size: 20px; font-weight: 700; margin: 0 0 16px 0; }
        p { margin: 0 0 16px 0; }
        .signoff { margin-top: 32px; padding-top: 24px; border-top: 1px solid #e6ebf1; color: #4f566b; font-size: 14px; }

        /* 📱 Mobile Gadget Optimizations */
        @media only screen and (max-width: 600px) {
          .wrapper { padding: 20px 0 !important; }
          .main { width: 100% !important; border-radius: 0 !important; border-left: none !important; border-right: none !important; }
          .header { padding: 30px 20px !important; }
          .content { padding: 30px 20px !important; }
          .footer { padding: 30px 20px !important; }
          .data-card { padding: 16px !important; margin: 16px 0 !important; }
          .brand div:first-child { font-size: 24px !important; }
          h2 { font-size: 18px !important; }
        }
      </style>
    </head>
    <body>
      <div class="wrapper">
        <table class="main" cellpadding="0" cellspacing="0" width="100%">
          <tr><td class="top-bar"></td></tr>
          <tr>
            <td class="header">
              <div class="brand" style="line-height: 1.2; color: #2563eb;">
                <div style="font-size: 28px; font-weight: 900; margin-bottom: 4px;">${mainPart.toUpperCase()}</div>
                ${subPart ? `<div style="font-size: 13px; font-weight: 700; letter-spacing: 3px; color: #2563eb; opacity: 0.9;">${subPart.toUpperCase()}</div>` : ''}
              </div>
            </td>
          </tr>
          <tr>
            <td class="content">
              ${content}
              <div class="signoff">
                Best Regards,<br>
                <strong style="color:#1a1f36;">${companyName} Team</strong>
              </div>
            </td>
          </tr>
        </table>
        <div class="footer">
          <strong>${companyName}</strong> &bull; ${year}<br>
          <span style="font-size: 11px; margin-top: 5px; display: block;">This is a mandatory system message. Please do not reply.</span>
        </div>
      </div>
    </body>
    </html>
  `;
};



const sendEmail = async (to, subject, text, html = null, attachments = [], broadcast_id = null) => {
  console.log(`[EMAIL-TRACE] Incoming request to: ${to} | Subject: ${subject}`);
  if (!to || !to.includes('@')) return { success: false, error: 'Invalid email' };

  try {
    const settings = db.prepare('SELECT email_enabled FROM settings LIMIT 1').get() || {};
    if (settings.email_enabled === 0) {
      console.log(`[EMAIL] System globally disabled. Skipping: ${subject}`);
      return { success: true, disabled: true };
    }
    
    // 🛡️ PERSISTENT QUEUE: Save to Database so it survives blackouts
    db.prepare(`
      INSERT INTO email_queue (recipient, subject, message_text, message_html, broadcast_id)
      VALUES (?, ?, ?, ?, ?)
    `).run(to, subject, text, html, broadcast_id);

    console.log(`[EMAIL-DB-QUEUE] Successfully saved to database for: ${to}`);
    return { success: true, queued: true };

  } catch (err) {
    console.error('[EMAIL-QUEUE-ERROR] Failed to save to DB:', err.message);
    return { success: false, error: err.message };
  }
};

/**
 * 🔄 Reset cached transporter — call this after SMTP settings change
 * so the new credentials are picked up on the next email send.
 */
const resetTransporter = () => {
  cachedTransporter = null;
  console.log('[EMAIL] Transporter cache cleared. New SMTP settings will apply on next send.');
};

module.exports = { sendEmail, getTransporter, resetTransporter, sendSingleItem, wrapInBrandedTemplate };

// ⚡ [FORCE] Clear any old transporter artifacts on startup
resetTransporter();
