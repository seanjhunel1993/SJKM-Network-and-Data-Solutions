const fs = require('fs');

const generateHtml = (client, days, companyName, gracePeriod) => {
    const isToday       = days === 'today';
    const isOverdueFin  = days === 'overdue_final';
    const isOverdue1    = days === 'overdue_1';
    const isOverdue     = isOverdueFin || isOverdue1;
    const highlightColor = (isToday || isOverdue) ? '#ef4444' : '#6366f1';

    let dueText = '';
    if (isToday)       dueText = 'TODAY';
    else if (isOverdue) dueText = 'PAST DUE – Pay Immediately';
    else               dueText = `in ${days} days`;

    let graceNotice = '';
    if (isOverdue1) {
        graceNotice = `<p style="background:#fee2e2;color:#b91c1c;padding:12px;border-radius:6px;font-size:13px;font-weight:600;margin-bottom:16px;">
            ⚠️ Your account has entered its <strong>${gracePeriod}-Day Grace Period</strong>. Please pay now to avoid automatic disconnection.
        </p>`;
    } else if (isOverdueFin) {
        graceNotice = `<p style="background:#fef2f2;color:#991b1b;padding:15px;border-radius:6px;font-size:14px;font-weight:700;border:2px solid #ef4444;margin-bottom:16px;">
            🚨 FINAL NOTICE: This is your last day of grace. Your connection will be automatically disabled if payment is not received today.
        </p>`;
    }

    return `
    <div style="font-family:'Inter',sans-serif;max-width:600px;margin:0 auto;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
        <div style="background:linear-gradient(135deg,#6366f1 0%,#8b5cf6 100%);padding:32px;text-align:center;color:white;">
            <h1 style="margin:0;font-size:24px;font-weight:800;">${companyName}</h1>
            <p style="margin:8px 0 0 0;opacity:0.9;">High-Speed Internet Services</p>
        </div>
        <div style="padding:32px;background:white;">
            ${graceNotice}
            <h2 style="margin:0 0 12px 0;color:#1e293b;font-size:20px;">Hello, ${client.full_name}!</h2>
            <p style="color:#475569;line-height:1.6;margin-bottom:24px;">
                Your internet service bill is due <strong style="color:${highlightColor};">${dueText}</strong> (${client.next_due_date}).
            </p>
            <div style="background:#f8fafc;padding:20px;border-radius:8px;margin-bottom:24px;">
                <table style="width:100%;border-collapse:collapse;">
                    <tr>
                        <td style="color:#64748b;font-size:14px;padding-bottom:8px;">Account Name</td>
                        <td style="text-align:right;font-weight:600;color:#1e293b;padding-bottom:8px;">${client.full_name}</td>
                    </tr>
                    <tr>
                        <td style="color:#64748b;font-size:14px;padding-bottom:8px;">Service Plan</td>
                        <td style="text-align:right;font-weight:600;color:#1e293b;padding-bottom:8px;">${client.plan}</td>
                    </tr>
                    <tr>
                        <td style="color:#64748b;font-size:14px;padding-bottom:8px;">Monthly Fee</td>
                        <td style="text-align:right;font-weight:600;color:#1e293b;padding-bottom:8px;">₱${Number(client.monthly_rate || 0).toLocaleString()}</td>
                    </tr>
                    <tr>
                        <td style="color:#64748b;font-size:14px;">Due Date</td>
                        <td style="text-align:right;font-weight:600;color:${highlightColor};">${client.next_due_date}</td>
                    </tr>
                </table>
            </div>
            <p style="color:#475569;font-size:14px;margin-bottom:24px;">
                To avoid service interruption, please settle your balance and upload your payment proof in the customer portal.
            </p>
            <div style="text-align:center;">
                <a href="http://localhost:3000/customer/login"
                   style="display:inline-block;background:#6366f1;color:white;padding:14px 28px;text-shadow:none;border-radius:8px;text-decoration:none;font-weight:700;font-size:16px;">
                   Open Customer Portal
                </a>
            </div>
        </div>
        <div style="background:#f1f5f9;padding:24px;text-align:center;color:#64748b;font-size:12px;">
            <p style="margin:0;">&copy; ${new Date().getFullYear()} ${companyName}. All rights reserved.</p>
            <p style="margin:4px 0 0 0;">This is an automated notification. Please do not reply to this email.</p>
        </div>
    </div>`;
}

const client = {
    full_name: "Juan Dela Cruz",
    plan: "Standard",
    monthly_rate: 999,
    next_due_date: "2024-05-15"
};

const html = generateHtml(client, 15, "SJKM Internet Solutions", 3);
fs.writeFileSync('C:/Users/Administrator/.gemini/antigravity/brain/b060162f-3ca9-476d-9a8a-824fa625097e/email_preview.html', html);
