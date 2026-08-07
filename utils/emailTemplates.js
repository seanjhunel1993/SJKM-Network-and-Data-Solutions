const db = require('../database');

/**
 * 💡 SMART SMS ENGINE: Replaces {{tags}} with real data
 */
function renderSms(template, data) {
  if (!template) return '';
  let rendered = template;
  
  // Dynamically include company name helpers
  const branding = getBranding();
  const mergedData = {
    company: branding.companyName,
    company_name: branding.companyName,
    ...data
  };

  Object.keys(mergedData).forEach(key => {
    const regex = new RegExp(`{{${key}}}`, 'g');
    rendered = rendered.replace(regex, mergedData[key] || '');
  });
  return rendered;
}

/**
 * 🏢 HELPER: Fetches dynamic branding from settings.
 */
const getBranding = () => {
  try {
    const settings = db.prepare('SELECT * FROM settings LIMIT 1').get() || {};
    return {
      companyName: settings.company_name || 'ISP Monitoring System',
      supportEmail: settings.support_email || '',
      supportPhone: settings.support_phone || '',
      facebookUrl: settings.facebook_url || '',
      customReceiptTemplate: settings.sms_receipt_template || null,
      customBillingTemplate: settings.sms_billing_reminder_template || null,
      sms_due_today_template: settings.sms_due_today_template || null,
      sms_overdue_template: settings.sms_overdue_template || null,
      sms_app_received_template: settings.sms_app_received_template || null,
      sms_app_approved_template: settings.sms_app_approved_template || null,
      sms_app_rejected_template: settings.sms_app_rejected_template || null,
      sms_welcome_template: settings.sms_welcome_template || null
    };
  } catch (e) {
    return { 
      companyName: 'ISP Monitoring System', supportEmail: '', supportPhone: '', facebookUrl: '',
      customReceiptTemplate: null, customBillingTemplate: null
    };
  }
};

/**
 * 📅 HELPER: Formats dates into "MONTH DAY, YEAR"
 */
const formatDate = (dateStr) => {
  if (!dateStr || typeof dateStr !== 'string') return dateStr;
  try {
    if (dateStr.includes(',') || dateStr.length < 5) return dateStr;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase();
  } catch (e) {
    return dateStr;
  }
};

const buildEmail = (title, bodyHtml, icon = '', titleColor = '#0f172a') => {
  return `
    <div style="margin-bottom: 24px;">
      <h2 style="font-size: 20px; color: ${titleColor}; margin-bottom: 8px;">${icon ? icon + ' ' : ''}${title}</h2>
      ${bodyHtml}
    </div>
  `;
};

/**
 * 📞 HELPER: Builds the "Contact Us" section
 */
const buildContactSection = () => {
  const { supportEmail, supportPhone, facebookUrl } = getBranding();
  if (!supportEmail && !supportPhone && !facebookUrl) return '';

  return `
    <div style="margin-top: 32px; padding-top: 20px; border-top: 1px solid #e2e8f0;">
      <p style="font-size: 14px; color: #475569; margin-bottom: 12px; font-weight: 600;">If you have any concerns, please CONTACT US:</p>
      <table style="width: 100%; font-size: 13px; color: #64748b;">
        ${supportEmail ? `<tr><td style="padding: 2px 0;"><strong>Email:</strong></td><td style="padding: 2px 0;"><a href="mailto:${supportEmail}" style="color: #3b82f6; text-decoration: none;">${supportEmail}</a></td></tr>` : ''}
        ${supportPhone ? `<tr><td style="padding: 2px 0;"><strong>Phone No.:</strong></td><td style="padding: 2px 0;">${supportPhone}</td></tr>` : ''}
        ${facebookUrl ? `<tr><td style="padding: 2px 0;"><strong>Facebook:</strong></td><td style="padding: 2px 0;"><a href="${facebookUrl}" style="color: #3b82f6; text-decoration: none;">Visit Link</a></td></tr>` : ''}
      </table>
    </div>
  `;
};

// --- CUSTOMER TEMPLATES ---

const applicationReceived = (fullName, accountId = 'Pending') => {
  const branding = getBranding();
  let smsText = `Hello ${fullName},\n\nWe've received your application. Reference ID: ${accountId}. We'll notify you once the review is complete.`;
  
  if (branding.sms_app_received_template) {
    smsText = renderSms(branding.sms_app_received_template, {
      name: fullName,
      account_id: accountId
    });
  }

  return {
    text: smsText,
    html: buildEmail('Application Received', `
      <p>Hello <strong>${fullName}</strong>,</p>
      <p>We have successfully received your internet application. Our technical team is currently reviewing your eligibility.</p>
      <div class="data-card">
        <span class="label">REFERENCE ID</span>
        <span class="value">${accountId}</span>
        <span class="label">STATUS</span>
        <span class="value" style="color: #3b82f6;">Under Review</span>
      </div>
      <p style="font-size: 14px; color: #64748b;">✓ No further action is required. We will notify you once the technical review is complete.</p>
    `, '✉️')
  };
};

const applicationApproved = (fullName, notes) => {
  const branding = getBranding();
  let smsText = `Hi ${fullName}! Your internet application has been APPROVED. Our team will contact you soon for installation.`;

  if (branding.sms_app_approved_template) {
    smsText = renderSms(branding.sms_app_approved_template, {
      name: fullName,
      notes: notes || 'None'
    });
  }

  return {
    text: smsText,
    html: buildEmail('Application Approved', `
      <p>Hello <strong>${fullName}</strong>,</p>
      <p>Great news! Your application for internet service has been <strong style="color: #16a34a;">Approved</strong>.</p>
      <div class="data-card">
        <span class="label">NEXT STEP</span>
        <span class="value">Awaiting Installation Schedule</span>
        ${notes ? `<span class="label">OFFICE NOTES</span><p style="font-size: 14px; margin-top: 5px;">${notes}</p>` : ''}
      </div>
      <p>Our technical team will contact you shortly with your specific installation date.</p>
    `, '✅')
  };
};

const installationScheduled = (fullName, scheduledDate, notes) => {
  const { companyName, supportPhone } = getBranding();
  return {
    text: `Hello ${fullName},\n\nYour installation is scheduled for ${scheduledDate}.`,
    html: buildEmail('Installation Scheduled', `
      <p>Hello <strong>${fullName}</strong>,</p>
      <p>Your installation has been scheduled! Our technicians will visit your location to finalize your connection.</p>
      <div class="data-card" style="border-left: 4px solid #3b82f6;">
        <span class="label">INSTALLATION DATE</span>
        <span class="value" style="font-size: 22px; color: #3b82f6;">${formatDate(scheduledDate)}</span>
        ${notes ? `<span class="label">IMPORTANT NOTES</span><p style="font-size: 14px; margin-top: 5px;">${notes}</p>` : ''}
      </div>
      <p style="font-size: 13px; color: #64748b;">Need to reschedule? Contact our support line at <strong>${supportPhone}</strong>.</p>
    `, '📅')
  };
};

const applicationRejected = (fullName, notes) => {
  const branding = getBranding();
  let smsText = `Hi ${fullName}. We regret to inform you that your application was not approved. Reason: ${notes || 'Area not yet covered.'}`;

  if (branding.sms_app_rejected_template) {
    smsText = renderSms(branding.sms_app_rejected_template, {
      name: fullName,
      reason: notes || 'Area not serviceable'
    });
  }

  return {
    text: smsText,
    html: buildEmail('Application Update', `
      <p>Hello <strong>${fullName}</strong>,</p>
      <p>We regret to inform you that we cannot proceed with your application at this time.</p>
      <div class="data-card" style="border-left: 4px solid #ef4444;">
        <span class="label">REASON</span>
        <span class="value" style="color:#ef4444;">${notes || 'Area not yet covered.'}</span>
      </div>
      <p>Thank you for your interest in our service.</p>
    `, '❌')
  };
};

const paymentReceived = (fullName, amount, paymentMethod, paidDate, accountId, nextDueDate, balance = 0, walletBalance = 0, monthlyRate = 0) => {
  const fmt = (v) => Number(v || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
  const branding = getBranding();

  // Calculate Advance Payment / Wallet Credit
  const walletHtml = walletBalance > 0
    ? `<tr><td style="padding: 6px 0; color: #10b981; font-size: 13px; font-weight: 600;">Advance Payment Applied</td><td style="padding: 6px 0; color: #10b981; font-weight: 700; text-align: right;">₱${fmt(walletBalance)}</td></tr>`
    : '';

  // Calculate Estimated Next Bill
  const nextBillAmount = Math.max(0, monthlyRate - walletBalance);
  const nextBillHtml = nextBillAmount < monthlyRate
    ? `<div style="margin-top: 10px; font-size: 12px; color: #64748b; font-style: italic;">Your next bill will be only <strong>₱${fmt(nextBillAmount)}</strong> after credits.</div>`
    : '';

  // --- Professional Next Action Box ---
  let nextActionHeader = 'NEXT SERVICE RENEWAL';
  let nextActionColor = '#3b82f6';
  let nextActionIcon = '🔄';
  let nextActionMessage = '';

  if (balance > 0) {
      // Partial Payment State
      nextActionHeader = 'PAYMENT DEADLINE';
      nextActionColor = '#ef4444';
      nextActionIcon = '⏳';
      nextActionMessage = `You have an outstanding balance of <strong>₱${fmt(balance)}</strong>. Please settle this by the deadline to avoid interruption.`;
  } else {
      // Full/Advance Payment State
      nextActionHeader = 'NEXT SERVICE RENEWAL';
      nextActionColor = '#3b82f6';
      nextActionIcon = '✅';
      if (walletBalance > 0) {
          nextActionMessage = `Your next bill will be only <strong>₱${fmt(nextBillAmount)}</strong> after applying your credits.`;
      } else {
          nextActionMessage = `Your account is fully paid! Enjoy your unlimited internet service.`;
      }
  }

  const isPartial = balance > 0;

  // Dynamic Financial Lines for SMS/Text
  let financialInfo = '';
  if (balance > 0) {
    financialInfo = `TOTAL AMOUNT DUE: P${fmt(balance)}`;
  } else if (walletBalance > 0) {
    financialInfo = `ADVANCE CREDIT: P${fmt(walletBalance)}\nNew Due Date: ${formatDate(nextDueDate)}`;
  } else {
    financialInfo = `New Due Date: ${formatDate(nextDueDate)}`;
  }

  // --- CUSTOM SMS TEMPLATE LOGIC ---
  let smsText = `${branding.companyName.toUpperCase()} OFFICIAL RECEIPT\n------------------\nHi Good day ${fullName}.\nWe Recieve your payment.\n\nAmount: P${fmt(amount)}\nDate: ${formatDate(paidDate)}\nStatus: ${isPartial ? 'PARTIAL PAYMENT' : 'FULLY PAID'}\n${financialInfo}\n\n------------------\nThank you for your payment!`;

  if (branding.customReceiptTemplate) {
      smsText = renderSms(branding.customReceiptTemplate, {
          name: fullName,
          amount: fmt(amount),
          date: formatDate(paidDate),
          status: isPartial ? 'PARTIAL PAYMENT' : 'FULLY PAID',
          balance: fmt(balance),
          credit: fmt(walletBalance),
          due_date: formatDate(nextDueDate),
          method: paymentMethod,
          account_id: accountId
      });
  }

  return {
    text: smsText,
    html: buildEmail('PAYMENT CONFIRMED', `
      <p style="color: #64748b; font-size: 15px; margin-bottom: 25px; line-height: 1.6;">Hi <strong>${fullName}</strong>,<br>Great news! We've successfully received and applied your payment. Your account has been updated.</p>
      
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 25px; margin-bottom: 25px;">
        <table style="width: 100%; border-collapse: collapse; font-family: 'Inter', sans-serif;">
          <tr>
            <td style="padding: 8px 0; color: #64748b; font-size: 13px; font-weight: 600; text-transform: uppercase;">Transaction Date</td>
            <td style="padding: 8px 0; color: #1e293b; font-weight: 700; text-align: right;">${formatDate(paidDate)}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #64748b; font-size: 13px; font-weight: 600; text-transform: uppercase;">Account Name</td>
            <td style="padding: 8px 0; color: #1e293b; font-weight: 700; text-align: right;">${fullName.toUpperCase()}</td>
          </tr>
          <tr>
             <td style="padding: 8px 0; color: #64748b; font-size: 13px; font-weight: 600; text-transform: uppercase;">Payment Method</td>
             <td style="padding: 8px 0; color: #3b82f6; font-weight: 800; text-align: right; text-transform: uppercase;">${paymentMethod}</td>
          </tr>
          <tr><td colspan="2" style="border-bottom: 1px solid #e2e8f0; padding: 10px 0;"></td></tr>
          
          <tr>
            <td style="padding: 15px 0 6px; color: #64748b; font-size: 14px; font-weight: 700;">AMOUNT RECEIVED</td>
            <td style="padding: 15px 0 6px; color: #10b981; font-weight: 900; text-align: right; font-size: 20px;">₱${fmt(amount)}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b; font-size: 13px;">Total Amount Due</td>
            <td style="padding: 6px 0; color: ${balance > 0 ? '#ef4444' : '#1e293b'}; font-weight: 700; text-align: right;">₱${fmt(balance)}</td>
          </tr>
          
          <tr><td colspan="2" style="padding: 15px 0;"></td></tr>
          
          <tr style="background: #10b981; color: #ffffff;">
            <td style="padding: 15px 20px; border-radius: 8px 0 0 8px; font-weight: 800; font-size: 13px; text-transform: uppercase; letter-spacing: 1px;">Status</td>
            <td style="padding: 15px 20px; border-radius: 0 8px 8px 0; font-weight: 800; font-size: 16px; text-align: right;">${balance > 0 ? 'PARTIAL PAYMENT' : 'FULLY PAID'}</td>
          </tr>
        </table>

        <div style="margin-top: 25px; background: #fff; padding: 20px; border-radius: 10px; border: 1px solid #e2e8f0; border-left: 5px solid ${nextActionColor}; color: #64748b; font-size: 14px; line-height: 1.6;">
             <strong>What happens next?</strong><br>
             ${nextActionMessage}
        </div>
      </div>
      
      <p style="font-size: 14px; color: #16a34a; font-weight: 600; text-align: center;">Thank you for keeping your account in good standing!</p>
      ${buildContactSection()}
    `, '', '#10b981')
  };
};

const billingReminder = (fullName, amount, dueDate, accountId, daysLeft, lastPayment = 0, planName = '', planPrice = 0, monthsOwed = 1, walletCredit = 0) => {
  const fmt = (v) => Number(v || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
  const branding = getBranding();
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  
  let statusHeader = 'UPCOMING BILL';
  let headerColor = '#3b82f6';
  let alertIcon = '';

  if (daysLeft === 0) {
      statusHeader = 'DUE TODAY';
      headerColor = '#f59e0b';
      alertIcon = '';
  } else if (daysLeft < 0) {
      statusHeader = 'OVERDUE NOTICE';
      headerColor = '#ef4444';
      alertIcon = '';
  }

  // Logic for the Formal Statement Breakdown
  const previousBalance = Math.max(0, (monthsOwed - 1) * planPrice);
  const currentCharges = planPrice;
  const advanceCredits = walletCredit;

  // --- CUSTOM SMS TEMPLATE LOGIC ---
  let smsText = `${branding.companyName.toUpperCase()} ${statusHeader}\n------------------\nHi Good Day ${fullName}! this is A friendly Reminder For your Internet Subscription\n\nDue Date: ${formatDate(dueDate)}\nLast Payment: P${fmt(lastPayment)}\nTotal Due: P${fmt(amount)}\n\n------------------\nPlease settle your balance to avoid service interruption. Thank you!`;

  // Select the appropriate template based on status
  let chosenTemplate = branding.customBillingTemplate; // Default to generic/upcoming
  if (daysLeft === 0 && branding.sms_due_today_template) {
      chosenTemplate = branding.sms_due_today_template;
  } else if (daysLeft < 0 && branding.sms_overdue_template) {
      chosenTemplate = branding.sms_overdue_template;
  }

  if (chosenTemplate) {
      smsText = renderSms(chosenTemplate, {
          name: fullName,
          amount: fmt(amount),
          due_date: formatDate(dueDate),
          last_payment: fmt(lastPayment),
          account_id: accountId,
          plan_name: planName,
          status: statusHeader
      });
  }

  return {
    text: smsText,
    html: buildEmail(statusHeader, `
      <p style="color: #64748b; font-size: 14px; margin-bottom: 20px;">Dear <strong>${fullName}</strong>, please find the summary of your internet service account below.</p>
      
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 25px; margin-bottom: 25px;">
        <table style="width: 100%; border-collapse: collapse; font-family: 'Inter', sans-serif;">
          <tr>
            <td style="padding: 8px 0; color: #64748b; font-size: 13px; font-weight: 600; text-transform: uppercase;">Statement Date</td>
            <td style="padding: 8px 0; color: #1e293b; font-weight: 700; text-align: right;">${today}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #64748b; font-size: 13px; font-weight: 600; text-transform: uppercase;">Account Name</td>
            <td style="padding: 8px 0; color: #1e293b; font-weight: 700; text-align: right;">${fullName.toUpperCase()}</td>
          </tr>
          <tr>
             <td style="padding: 8px 0; color: #64748b; font-size: 13px; font-weight: 600; text-transform: uppercase;">Account ID</td>
             <td style="padding: 8px 0; color: #1e293b; font-weight: 700; text-align: right;">${accountId}</td>
          </tr>
          <tr><td colspan="2" style="border-bottom: 1px solid #e2e8f0; padding: 10px 0;"></td></tr>
          
          <tr>
            <td style="padding: 12px 0 6px; color: #64748b; font-size: 13px;">Balance from Last Bill</td>
            <td style="padding: 12px 0 6px; color: ${previousBalance > 0 ? '#ef4444' : '#1e293b'}; font-weight: 700; text-align: right;">₱${fmt(previousBalance)}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b; font-size: 13px;">Current Charges (${planName})</td>
            <td style="padding: 6px 0; color: #1e293b; font-weight: 700; text-align: right;">₱${fmt(currentCharges)}</td>
          </tr>
          ${advanceCredits > 0 ? `
          <tr>
            <td style="padding: 6px 0; color: #10b981; font-size: 13px; font-weight: 600;">Advance Payments / Credits</td>
            <td style="padding: 6px 0; color: #10b981; font-weight: 700; text-align: right;">- ₱${fmt(advanceCredits)}</td>
          </tr>` : ''}
          
          <tr><td colspan="2" style="padding: 15px 0;"></td></tr>
          
          <tr style="background: ${headerColor}; color: #ffffff;">
            <td style="padding: 15px 20px; border-radius: 8px 0 0 8px; font-weight: 800; font-size: 15px;">TOTAL AMOUNT DUE</td>
            <td style="padding: 15px 20px; border-radius: 0 8px 8px 0; font-weight: 800; font-size: 22px; text-align: right;">₱${fmt(amount)}</td>
          </tr>
        </table>

        <div style="margin-top: 25px; background: #fff; padding: 20px; border-radius: 10px; border: 1px solid #e2e8f0; border-left: 5px solid ${headerColor}; color: #64748b; font-size: 14px; line-height: 1.5;">
             Please settle your balance to avoid service interruption.
        </div>
      </div>
      
      <p style="font-size: 14px; color: #64748b; line-height: 1.6;">If you have already paid, please ignore this notice. Thank you!</p>
      ${buildContactSection()}
    `, alertIcon, headerColor)
  };
};

const ticketReplied = (fullName, subject, reply) => ({
  text: `Hello ${fullName},\n\nSupport team replied to: ${subject}.`,
  html: buildEmail('Support Ticket Update', `
    <p>Hello <strong>${fullName}</strong>,</p>
    <p>Our technical team has responded to your support ticket regarding <strong>"${subject}"</strong>.</p>
    <div class="data-card">
      <span class="label">LATEST RESPONSE</span>
      <div style="font-size: 15px; color: #0f172a; line-height: 1.6; margin-top: 10px; border-top: 1px solid #e2e8f0; padding-top: 15px;">
        ${reply}
      </div>
    </div>
  `, '🎧')
});

const ticketResolved = (fullName, subject) => ({
  text: `Hello ${fullName},\n\nYour support ticket regarding "${subject}" has been marked as RESOLVED.`,
  html: buildEmail('Ticket Resolved', `
    <p>Hello <strong>${fullName}</strong>,</p>
    <p>Your support ticket regarding <strong>"${subject}"</strong> has been successfully <strong style="color: #16a34a;">Resolved</strong>.</p>
    <div class="data-card" style="background-color: #f0fdf4; border-color: #bbf7d0;">
      <p style="font-size: 14px; color: #166534; font-weight: 600; margin: 0;">✓ This issue is now complete. If you still need help, you can open a new ticket anytime.</p>
    </div>
    <p style="margin-top: 15px;">Thank you for your patience!</p>
  `, '✅')
});

const getBroadCastTemplate = (fullName, message) => ({
  text: `Hello ${fullName},\n\nAnnouncement:\n${message}`,
  html: buildEmail('Announcement', `
    <p>Hello <strong>${fullName}</strong>,</p>
    <p>The technical team has an important announcement regarding your service:</p>
    <div class="data-card" style="background-color: #eff6ff; border-color: #bfdbfe;">
      <div style="color: #1e40af; font-size: 15px; white-space: pre-wrap; font-weight: 500;">
        ${message}
      </div>
    </div>
  `, '📢')
});

const welcomeWithCredentials = (fullName, accountId, defaultPassword, plan) => {
  const branding = getBranding();
  let smsText = `Welcome to ${branding.companyName} ${fullName}!\n\nYour account is ready.\nAcc ID: ${accountId}\nPass: ${defaultPassword}\nPlan: ${plan}\n\nPlease change your password upon login.`;

  if (branding.sms_welcome_template) {
    smsText = renderSms(branding.sms_welcome_template, {
      name: fullName,
      account_id: accountId,
      password: defaultPassword,
      plan: plan
    });
  }

  return {
    text: smsText,
    html: buildEmail('Account Ready 🎉', `
      <p>Hello <strong>${fullName}</strong>,</p>
      <p>Welcome! Your account has been provisioned and your service is ready to use.</p>
      <div class="data-card" style="background: #fdf2f8; border-color: #fbcfe8;">
        <span class="label">ACCOUNT NUMBER</span>
        <span class="value" style="letter-spacing: 2px; color: #db2777;">${accountId}</span>
        <span class="label">PORTAL PASSWORD</span>
        <span class="value" style="font-family: monospace; background: #ffffff; padding: 5px 10px; border-radius: 4px;">${defaultPassword}</span>
        <span class="label">PLAN TYPE</span>
        <span class="value">${plan}</span>
      </div>
      <p style="color: #ef4444; font-size: 13px; font-weight: 600;">⚠️ Please log in and change your password immediately.</p>
    `, '🎉')
  };
};

module.exports = {
  applicationReceived,
  applicationApproved,
  installationScheduled,
  applicationRejected,
  paymentReceived,
  billingReminder,
  paymentReminder: billingReminder,
  ticketReplied,
  ticketResolved,
  getBroadCastTemplate,
  welcomeWithCredentials,
  activationAlert: (machineId, otp, computerName) => ({
    text: `SECURITY ALERT: New system installation detected on machine ${machineId} (${computerName}). Use OTP ${otp} to activate.`,
    html: `
      <div style="text-align: center; padding: 20px;">
        <div style="display: inline-block; padding: 12px 24px; background-color: #fee2e2; border-radius: 50px; color: #ef4444; font-size: 12px; font-weight: 700; margin-bottom: 24px; text-transform: uppercase; letter-spacing: 1px;">
          Security Alert
        </div>
        <h2 style="color: #1f2937; margin-bottom: 8px;">New Activation Request</h2>
        <p style="color: #6b7280; margin-bottom: 32px;">A new computer is trying to run your OLT Monitoring System. If this was not you, please secure your server immediately.</p>
        
        <div style="background-color: #f8fafc; border: 1px solid #edf2f7; border-radius: 6px; padding: 24px; margin: 24px 0; text-align: left;">
          <span style="display: block; font-size: 11px; font-weight: 600; color: #a3acb9; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">Target Computer</span>
          <span style="display: block; font-size: 15px; font-weight: 600; color: #1a1f36; margin-bottom: 16px;">${computerName}</span>
          
          <span style="display: block; font-size: 11px; font-weight: 600; color: #a3acb9; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">Machine ID (Motherboard)</span>
          <span style="display: block; font-size: 15px; font-weight: 600; color: #1a1f36; font-family: monospace; font-size: 13px;">${machineId}</span>
        </div>

        <div style="background-color: #f8fafc; border: 2px dashed #e2e8f0; border-radius: 12px; padding: 32px; margin: 32px 0;">
          <span style="display: block; font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 12px;">Your 6-Digit Activation OTP</span>
          <span style="display: block; font-size: 48px; font-weight: 800; color: #ef4444; letter-spacing: 8px;">${otp}</span>
        </div>

        <p style="font-size: 13px; color: #94a3b8; margin-top: 32px;">Give this code to the technician on-site to unlock the system.</p>
      </div>
    `
  }),
  adminAlert: (title, color, msg, cid, ip, time) => ({ text: msg, html: buildEmail(title, `<p>${msg}</p>`) }),
  adminNewApplication: (name, plan, contact, email) => ({ text: name, html: buildEmail('New Application', `<p>${name} applied for ${plan}</p>`) }),
  adminHighPriorityTicket: (name, sub, prio, msg) => ({ text: sub, html: buildEmail('Urgent Ticket', `<p>${msg}</p>`) }),
  revenueSummary: (period, total, counts, details) => ({ text: period, html: buildEmail(period, `<h3>Total: ₱${total.toLocaleString()}</h3>`) }),
  twoFactorTemplate: (name, code) => ({ text: code, html: buildEmail('Security Code', `<h1>${code}</h1>`) }),
  paymentRejected: (name, reason) => ({ text: reason, html: buildEmail('Payment Rejected', `<p>${reason}</p>`) })
};
