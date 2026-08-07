const db = require('../database');
const { sendEmail } = require('./email');
const { sendSMS } = require('./sms');
const emailTemplates = require('./emailTemplates');
const { getSettings, parseDateStrict } = require('./shared');
const logger = require('./logger');
const mikrotik = require('./mikrotik');

/**
 * 🛡️ INTERNAL/SERVICE ACCOUNT PROTECTION
 * Accounts matching these patterns are NEVER auto-suspended — they are
 * the company's own infrastructure (server, backbone, core, owner, etc.).
 * Add account names here (lowercase) OR match by substring.
 */
const INTERNAL_ACCOUNT_EXCLUDES = [
  'server', 'backbone', 'main', 'core', 'owner', 'admin',
  'gateway', 'uplink', 'link', 'trunk', 'staff', 'free',
  'isp', 'sjm', 'sjkm', 'test', 'nms', 'monitor'
];

function isInternalAccount(client) {
  if (!client) return false;
  const haystack = [
    String(client.pppoe_user || '').toLowerCase().trim(),
    String(client.full_name || '').toLowerCase().trim(),
    String(client.account_id || '').toLowerCase().trim()
  ].join(' | ');
  return INTERNAL_ACCOUNT_EXCLUDES.some(keyword => haystack.includes(keyword));
}

/**
 * 📅 CORE BILLING ENGINE
 * Scans all active clients and sends reminders based on DB settings.
 * Supports: Early Reminder (Rem1), Final Reminder (Rem2), Due Today, and Grace Catch-up.
 */
async function runBillingChecks(manualAdmin = null) {
    const runStart = new Date();
    const logPrefix = manualAdmin ? `[MANUAL-BILLING-SCAN by ${manualAdmin}]` : '[AUTO-BILLING-SCAN]';
    
    logger.info(`${logPrefix} Starting scan...`);

    try {
        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];
        
        // 1. Load Settings
        const settings = getSettings();
        const emailEnabled = !!settings.email_enabled;
        const smsEnabled = !!settings.enable_sms_billing;
        
        // Load interval settings (honor DB values)
        const rem1Days = parseInt(settings.reminder_1_days) || 7;
        const rem2Days = parseInt(settings.reminder_2_days) || 2;
        const graceDays = parseInt(settings.grace_period) || 3;

        if (!emailEnabled && !smsEnabled) {
            logger.info(`${logPrefix} Both Email and SMS are disabled in settings. Skipping scan.`);
            return { success: true, message: 'Messaging disabled' };
        }

        // 2. Load Active Clients
        const clients = db.prepare(`
            SELECT c.id, c.account_id, c.full_name, c.email, c.contact, c.billing_day, c.next_due_date, c.plan, c.pppoe_user, c.wallet_balance, p.price as plan_price, p.name as plan_name
            FROM clients c
            LEFT JOIN plans p ON LOWER(c.plan) = LOWER(p.name) OR LOWER(c.plan) = LOWER(p.id)
            WHERE c.status = 'active'
        `).all();

        let stats = { scanned: 0, skippedNoData: 0, skippedNotDue: 0, skippedAlreadySent: 0, emailSent: 0, smsSent: 0, errors: 0 };

        for (const client of clients) {
            stats.scanned++;

            // Skip clients without billing info
            if (!client.billing_day || !client.plan_price) {
                stats.skippedNoData++;
                continue;
            }
            
            let dueDateObj = null;

            // --- 1. DETERMINE DUE DATE ---
            // Preference 1: Use 'next_due_date' from DB (Standard)
            if (client.next_due_date) {
                dueDateObj = parseDateStrict(client.next_due_date);
            }

            // Preference 2: Fallback to billing_day calculation (Legacy/Fail-safe)
            if (!dueDateObj || isNaN(dueDateObj.getTime())) {
                let dueMonth = now.getMonth();
                let dueYear = now.getFullYear();
                
                // If today is past the billing day, we are looking at next month's due date
                if (now.getDate() > client.billing_day) {
                    dueMonth += 1;
                    if (dueMonth > 11) {
                        dueMonth = 0;
                        dueYear += 1;
                    }
                }
                dueDateObj = new Date(dueYear, dueMonth, client.billing_day);
            }
            
            // --- 2. CALCULATE REMINDER TRIGGER ---
            const nowTime = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
            let reminderDateObj = new Date(dueDateObj);
            let diffDays = Math.round((new Date(reminderDateObj.getFullYear(), reminderDateObj.getMonth(), reminderDateObj.getDate()).getTime() - nowTime) / (1000 * 60 * 60 * 24));

            // OPTION B: If overdue (diffDays < 0), look ahead to the NEXT cycle for automated reminders
            if (diffDays < 0) {
                while (diffDays < 0) {
                    reminderDateObj.setMonth(reminderDateObj.getMonth() + 1);
                    diffDays = Math.round((new Date(reminderDateObj.getFullYear(), reminderDateObj.getMonth(), reminderDateObj.getDate()).getTime() - nowTime) / (1000 * 60 * 60 * 24));
                }
            }
            
            // --- Determine Reminder Type ---
            let reminderPrefix = null;
            if (diffDays === 0) {
                reminderPrefix = 'DUEDATE';
            } else if (diffDays <= rem2Days && diffDays > 0) {
                reminderPrefix = 'REM2';
            } else if (diffDays <= rem1Days && diffDays > 0) {
                reminderPrefix = 'REM1';
            }

            if (!reminderPrefix) {
                stats.skippedNotDue++;
                continue;
            }

            // For automated reminders, we now use the reminderDateObj (the upcoming cycle) for the unique key
            const reminderType = `${reminderPrefix}_${reminderDateObj.getFullYear()}_${reminderDateObj.getMonth()+1}`;

            // Check granular SMS/Email toggles if they exist (enable_sms_rem1 etc)
            const isSmsAllowed = smsEnabled && (
                (reminderPrefix === 'REM1' && (settings.enable_sms_rem1 !== 0)) ||
                (reminderPrefix === 'REM2' && (settings.enable_sms_rem2 !== 0)) ||
                (reminderPrefix === 'DUEDATE' && (settings.enable_sms_due_day !== 0))
            );
            
            // Check if we already sent this specific reminder to this client
            const check = db.prepare('SELECT id FROM reminders_log WHERE type = ? AND target = ?').get(reminderType, client.account_id);
            if (check) {
                stats.skippedAlreadySent++;
                continue;
            }

            const dueDateStr = dueDateObj.toISOString().split('T')[0];
            const formattedDate = dueDateObj.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
            
            // ─── DYNAMIC BALANCE CALCULATION ───
            let months_owed = 0;
            let tempDate = new Date(dueDateObj.getFullYear(), dueDateObj.getMonth(), dueDateObj.getDate());
            const nowTimeNoTime = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
            
            while (tempDate.getTime() <= nowTimeNoTime) {
                months_owed++;
                tempDate.setMonth(tempDate.getMonth() + 1);
            }
            
            if (months_owed === 0 && diffDays <= Math.max(rem1Days, rem2Days)) {
                months_owed = 1;
            } else if (months_owed > 0) {
                // If already overdue, check if the NEXT cycle is also due soon (within Rem1 window)
                // This ensures the reminder shows (Overdue Months + Upcoming Month)
                const nextCycleDate = new Date(tempDate);
                const diffNext = Math.round((nextCycleDate.getTime() - nowTimeNoTime) / (1000 * 60 * 60 * 24));
                if (diffNext <= rem1Days) {
                    months_owed++;
                }
            }

            const rawPlanPrice = client.plan_price || 0;
            const wallet = client.wallet_balance || 0;
            let exactAmountDue = (months_owed * rawPlanPrice) - wallet;
            
            if (exactAmountDue < 0) exactAmountDue = 0;
            const amountFormatted = exactAmountDue.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});

            // Fetch Last Payment Amount
            const lastPaymentObj = db.prepare("SELECT amount FROM payments WHERE client_id = ? AND status = 'paid' ORDER BY paid_date DESC, id DESC LIMIT 1").get(client.id);
            let lastPayRaw = lastPaymentObj ? lastPaymentObj.amount : 0;
            if (typeof lastPayRaw === 'string') lastPayRaw = lastPayRaw.replace(/[^\d.]/g, '');
            const lastPaymentAmt = parseFloat(lastPayRaw) || 0;
            
            // Formatting helper
            const fmt = (v) => {
                try {
                    return Number(v || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
                } catch(e) { return '0.00'; }
            };
            const planName = client.plan || 'Internet Service';
            const creditLineSms = wallet > 0 ? `\nCREDIT: P${fmt(wallet)}` : '';
            const lastPaymentSms = (wallet > 0 && lastPaymentAmt > 0) ? `\nLAST PAYMENT: P${fmt(lastPaymentAmt)}` : '';

            // ─── EMAIL DISPATCH ───
            if (emailEnabled && client.email && client.email.includes('@')) {
                try {
                    const template = emailTemplates.billingReminder(client.full_name, exactAmountDue, dueDateStr, client.account_id, diffDays, lastPaymentAmt, planName, rawPlanPrice, months_owed, wallet);
                    const subj = reminderPrefix === 'DUEDATE' ? 'ACCOUNT DUE TODAY' : (reminderPrefix === 'OVERDUE' ? 'URGENT: PAYMENT OVERDUE' : 'PAYMENT REMINDER');
                    
                    sendEmail(client.email, subj, template.text, template.html)
                        .then(result => {
                            if (result && result.success) logger.info(`${logPrefix} 📧 Email queued to ${client.email}`);
                        })
                        .catch(e => logger.error(`${logPrefix} 📧 Email Error for ${client.email}: ${e.message}`));
                    stats.emailSent++;
                } catch (e) { stats.errors++; }
            }

            // ─── SMS DISPATCH ───
            if (isSmsAllowed && client.contact) {
                try {
                    // We use the same concise PLDT-style text generated in emailTemplates
                    const template = emailTemplates.billingReminder(client.full_name, exactAmountDue, dueDateStr, client.account_id, diffDays, lastPaymentAmt, planName, rawPlanPrice, months_owed, wallet);
                    let smsMsg = template.text;
                    
                    const { queueSMS } = require('./sms');
                    queueSMS(client.contact, smsMsg, client.full_name);
                    stats.smsSent++;
                } catch (e) { stats.errors++; }
            }

            // Log that we processed it
            try {
                db.prepare("INSERT INTO reminders_log (type, target, sent_at) VALUES (?, ?, datetime('now', 'localtime'))").run(reminderType, client.account_id);
                // Log to events for dashboard visibility
                const eventType = reminderPrefix === 'DUEDATE' ? 'Due Today Reminder' : 'Upcoming Reminder';
                db.prepare("INSERT INTO events (type, pppoe_user, timestamp) VALUES (?, ?, datetime('now', 'localtime'))").run(eventType, client.pppoe_user);
            } catch (logErr) {
                logger.error(`${logPrefix} Log Error for ${client.account_id}: ${logErr.message}`);
            }
        }

// ─── ⛔ AUTO-SUSPENSION PHASE: Overdue Clients ───
        // Detect clients whose due date has passed the grace period and suspend them.
        // NOTE: `graceDays` is already declared at the top of this function scope.
        const disableMt = settings.disable_mikrotik === 1;
        const unpaidProfile = settings.unpaid_profile_name || 'SUSPENDED';

        const overdueClients = db.prepare(`
            SELECT c.id, c.account_id, c.full_name, c.next_due_date, c.pppoe_user, c.plan, c.status
            FROM clients c
            WHERE c.status NOT IN ('disabled', 'suspended', 'deleted', 'disconnected', 'inactive')
              AND c.next_due_date IS NOT NULL
              AND c.next_due_date != ''
        `).all();

        let suspendedCount = 0;
        const nowDateOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

for (const client of overdueClients) {
            const due = parseDateStrict(client.next_due_date);
            if (!due) continue;

            // 🛡️ NEVER suspend internal/service/infrastructure accounts
            if (isInternalAccount(client)) {
                logger.info(`${logPrefix} 🛡️ Skipped auto-suspend for internal account ${client.full_name} (${client.account_id}).`);
                continue;
            }

            // Due date + grace period is before today → overdue
            const overdueThreshold = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime() + (graceDays * 24 * 60 * 60 * 1000);
            if (overdueThreshold >= nowDateOnly) continue; // not overdue yet

            // ── 1. Update MikroTik (switch to SUSPENDED profile) ──
            if (!disableMt && client.pppoe_user) {
                try {
                    await mikrotik.switchToUnpaid(client.pppoe_user, unpaidProfile);
                } catch (e) {
                    logger.error(`${logPrefix} ⛔ Suspension router error for ${client.pppoe_user}: ${e.message}`);
                }
            }

            // ── 2. Update local DB status ──
            db.prepare("UPDATE clients SET status = 'suspended' WHERE id = ?").run(client.id);

            // ── 3. Log to events ──
            try {
                db.prepare("INSERT INTO events (type, pppoe_user, caller_id, ip_address, timestamp) VALUES (?, ?, ?, ?, datetime('now', 'localtime'))")
                    .run('AUTO_SUSPEND', client.pppoe_user, 'Billing System', `Overdue → suspended (grace ${graceDays}d)`);
            } catch (e) {}

            // ── 4. Log to activity log ──
            try {
                db.prepare("INSERT INTO activity_log (category, action, details, admin_name, client_id, timestamp) VALUES (?, ?, ?, ?, ?, datetime('now', 'localtime'))")
                    .run('Billing', 'Auto-Suspend', JSON.stringify({ client: client.full_name, account: client.account_id, due: client.next_due_date }), 'Billing System', client.id);
            } catch (e) {}

            suspendedCount++;
            logger.info(`${logPrefix} ⛔ Auto-suspended ${client.full_name} (${client.account_id}) — overdue.`);
        }

if (suspendedCount > 0) {
            logger.info(`${logPrefix} ⛔ Auto-suspended ${suspendedCount} overdue client(s).`);
        }

        // ─── 🛡️ RESTORE PROTECTED ACCOUNTS that were previously auto-suspended ───
        // If an internal/service account was mistakenly suspended in the past, restore it.
        const suspendedProtected = db.prepare(`
            SELECT c.id, c.account_id, c.full_name, c.pppoe_user
            FROM clients c
            WHERE c.status = 'suspended'
        `).all();

        let restoredCount = 0;
        for (const client of suspendedProtected) {
            if (isInternalAccount(client)) {
                db.prepare("UPDATE clients SET status = 'active' WHERE id = ?").run(client.id);
                logger.info(`${logPrefix} 🛡️ Restored protected internal account ${client.full_name} (${client.account_id}) back to active.`);
                restoredCount++;
            }
        }
        if (restoredCount > 0) {
            logger.info(`${logPrefix} 🛡️ Restored ${restoredCount} protected internal account(s) back to active.`);
        }

        const duration = Date.now() - runStart.getTime();
        logger.info(`${logPrefix} Completed in ${duration}ms. Scanned: ${stats.scanned} | Sent: ${stats.emailSent} emails, ${stats.smsSent} SMS.`);
        
        stats.suspended = suspendedCount;
        return { success: true, stats, duration };

    } catch (err) {
        logger.error(`${logPrefix} CRITICAL ERROR: ${err.message}`);
        return { success: false, error: err.message };
    }
}

module.exports = {
    runBillingChecks
};
