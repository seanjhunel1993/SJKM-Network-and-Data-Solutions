const db = require('../database');
const { sendSMS } = require('./sms');

const MAX_RETRIES = 5; // Give up after 5 consecutive failures

let isProcessing = false;

/**
 * SMS Background Worker
 * Monitors the sms_queue and dispatches messages when the gateway is online.
 */
async function processSmsQueue() {
  if (isProcessing) return;
  isProcessing = true;
  try {
    // 1. CLEANUP: Keep only sent messages older than 3 days (preserve failure history longer)
    db.prepare(`
      DELETE FROM sms_queue 
      WHERE status = 'sent' AND created_at < datetime('now', '-3 days')
    `).run();

    // Wipe permanently failed messages (exceeded max retries) older than 7 days
    db.prepare(`
      DELETE FROM sms_queue 
      WHERE status = 'failed' AND retry_count >= ? AND created_at < datetime('now', '-7 days')
    `).run(MAX_RETRIES);

    // Delete activity logs older than 90 days (Auto-Cleaning)
    db.prepare(`
      DELETE FROM activity_log 
      WHERE timestamp < datetime('now', '-90 days')
    `).run();

    // 2. FETCH: Get pending messages — skip permanently failed ones (exceeded retries)
    const pending = db.prepare(`
      SELECT * FROM sms_queue 
      WHERE status IN ('pending', 'failed') AND retry_count < ?
      ORDER BY id ASC 
      LIMIT 10
    `).all(MAX_RETRIES);

    if (pending.length === 0) return; // Silent — nothing to do

    // 3. CHECK HEALTH: Only flush if Android gateway is configured
    const settings = db.prepare('SELECT * FROM settings LIMIT 1').get() || {};
    if (!settings.sms_android_ip) {
      console.log('[SMS-WORKER] No Android IP configured — queue processing skipped.');
      return;
    }

    // Reset offline flag if we're starting a new check
    global.gatewayWasOffline = global.gatewayWasOffline || false;

    // console.log(`[SMS-WORKER] Processing ${pending.length} queued message(s)...`);

    // 4. SEQUENTIAL SEND: One by one to avoid overwhelming the phone SIM
    for (const msg of pending) {
      const res = await sendSMS(msg.number, msg.message, msg.recipient_name || 'System', true);

      if (res.success && !res.queued) {
        // ✅ Successfully delivered
        if (global.gatewayWasOffline) {
          // console.log(`📡 [SMS-WORKER] Gateway recovered.`);
        }
        global.gatewayWasOffline = false;
        db.prepare("UPDATE sms_queue SET status = 'sent', sent_at = datetime('now', 'localtime') WHERE id = ?").run(msg.id);
        if (msg.broadcast_id) {
          db.prepare("UPDATE broadcasts SET sms_success = sms_success + 1 WHERE id = ?").run(msg.broadcast_id);
        }
        // console.log(`✅ [SMS] Delivered ID: ${msg.id}`);

      } else {
        const errMsg = res.error || 'Unknown error';

        // ─── Categorize failure ───
        const isOffline = errMsg.includes('Timeout') || errMsg.includes('Offline') ||
                          errMsg.includes('Unreachable') || errMsg.includes('ECONNREFUSED') ||
                          errMsg.includes('abort');

        if (isOffline) {
          // Gateway is down — stop processing this batch, retry later
          global.gatewayWasOffline = true;
          // console.warn(`⚠️  [SMS-GATEWAY] Offline. Pausing queue.`);
          break;
        } else {
          // Permanent-ish failure (bad number, gateway rejection, etc.)
          global.gatewayWasOffline = false;
          const newRetry = (msg.retry_count || 0) + 1;
          const gaveUp = newRetry >= MAX_RETRIES;

          db.prepare("UPDATE sms_queue SET status = 'failed', retry_count = retry_count + 1 WHERE id = ?").run(msg.id);

          if (msg.broadcast_id) {
            db.prepare("UPDATE broadcasts SET sms_failed = sms_failed + 1 WHERE id = ?").run(msg.broadcast_id);
          }

          if (gaveUp) {
            // console.error(`🚫 [SMS-WORKER] Giving up on ID ${msg.id} → ${msg.number} after ${MAX_RETRIES} attempts. Error: ${errMsg}`);
          } else {
            // console.error(`❌ [SMS-WORKER] Attempt ${newRetry}/${MAX_RETRIES} failed for ${msg.number}: ${errMsg}`);
          }
          // Continue to next message in batch
        }
      }

      // Safety delay between sends (protects the SIM card from being flagged as spam)
      // Increased to 6s to comply with Android Gateway high-volume limitations.
      await new Promise(r => setTimeout(r, 6000));
    }

  } catch (err) {
    // console.error('❌ [SMS-WORKER] Unexpected error:', err.message);
  } finally {
    isProcessing = false;
  }
}

/**
 * Starts the worker on a fixed interval
 */
function startSmsWorker(intervalMs = 15000) {
  console.log('🤖 [SMS-WORKER] Resilience Queue Worker initialized (15s cycle).');
  setInterval(processSmsQueue, intervalMs);
}

module.exports = { startSmsWorker, processSmsQueue };
