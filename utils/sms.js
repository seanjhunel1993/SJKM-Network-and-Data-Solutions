const db = require('../database');

/**
 * Android SMS Gateway Utility (Local Network)
 * Exclusively supports Android SMS Gateway for cost-effective local sending.
 */
async function sendSMS(number, message, recipientName = 'System', isWorker = false, broadcastId = null) {
  // Load settings fresh from DB on every call
  const settings = db.prepare('SELECT * FROM settings LIMIT 1').get() || {};
  const { sms_android_ip, sms_api_key } = settings;

  // Fail-safe: No IP provided — simulate send (dev mode)
  if (!sms_android_ip) {
    console.log(`[SMS-LOG] No Android Gateway IP configured. Simulating SMS to ${number}.`);
    return { success: true, mock: true };
  }

  // ─── Branding Prefix (Disabled for reliability) ───
  let brandedMessage = message;
  
  // If message starts with '!', just remove the '!' and send raw
  // This allows the admin to use '!' as a trigger without showing it to the client.
  if (message.startsWith('!')) {
    brandedMessage = message.substring(1).trim();
  }
  
  // No more automatic "FIBR COM:" prefix to avoid Telco spam filters.
  // The user can type their own branding or use '!' if their app needs it.

    // ─── Number Normalization (Clean Digits Only) ───
    let normalizedNumber = number.replace(/\D/g, ''); 

    // Handle Philippine Country Code (63 -> 0)
    if (normalizedNumber.startsWith('639') && normalizedNumber.length === 12) {
      normalizedNumber = '0' + normalizedNumber.substring(2);
    }
    
    // Ensure 11 digits (take last 11 and force 0 prefix if needed)
    if (normalizedNumber.length > 11) {
      normalizedNumber = normalizedNumber.slice(-11);
    }
    
    // If it's 10 digits starting with 9, add the 0
    if (normalizedNumber.length === 10 && normalizedNumber.startsWith('9')) {
      normalizedNumber = '0' + normalizedNumber;
    }

    try {
      // ─── ANDROID GATEWAY MODE (LOCAL NETWORK) ───
      let baseUrl = sms_android_ip.startsWith('http') ? sms_android_ip : `http://${sms_android_ip}`;

      // Build URL list: try /send-sms first, then base URL (unless user already specified a path)
      const urlsToTry = sms_android_ip.includes('/', 8) ? [baseUrl] : [`${baseUrl}/send-sms`, baseUrl];

      // Build request headers — include API key if configured
      const headers = { 'Content-Type': 'application/json' };
      if (sms_api_key && sms_api_key.trim()) {
        headers['Authorization'] = `Bearer ${sms_api_key.trim()}`;
      }

      let lastError = null;
      for (const url of urlsToTry) {
        try {
          // console.log(`[SMS-FLOW] Trying Gateway: ${url} → ${normalizedNumber}`);

          // Use manual AbortController for Node.js v16 compatibility
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000);

          const payload = {
            phone:   normalizedNumber,
            message: brandedMessage
          };

          const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
            signal: controller.signal
          });

          clearTimeout(timeoutId);

          if (response.ok) {
            const rawBody = await response.text();
            // console.log(`[SMS-TRACE] Raw Response from ${url}: ${rawBody}`);
            
            let body = null;
            try { body = JSON.parse(rawBody); } catch (_) {}

          // Check if the body explicitly signals failure
          if (body !== null) {
            const bodySuccess = body.success ?? body.ok ?? body.status ?? true;
            const isFailed = bodySuccess === false || bodySuccess === 'error' || bodySuccess === 'failed';
            if (isFailed) {
              const bodyErr = body.message || body.error || body.reason || JSON.stringify(body);
              console.error(`[SMS-ERROR] Gateway returned HTTP 200 but body indicates failure: ${bodyErr}`);
              lastError = `Gateway Rejected: ${bodyErr}`;
              continue; // Try next URL
            }
          }

          console.log(`✅ [SMS] Delivered to ${number}`);
          return { success: true };
        }

        // Non-200: capture status and try next URL
        lastError = `HTTP ${response.status}`;
        // console.warn(`[SMS-WARN] Gateway at ${url} returned ${response.status}`);

      } catch (e) {
        lastError = e.message;
        if (e.name === 'AbortError' || e.message.includes('abort')) {
          lastError = 'Timeout';
          // console.warn(`[SMS-TIMEOUT] Gateway at ${url} did not respond within 5s`);
        } else {
          // console.warn(`[SMS-WARN] Gateway at ${url} error: ${e.message}`);
        }
      }
    }

    throw new Error(`Gateway Unreachable: ${lastError}`);

  } catch (error) {
    let friendlyMsg = error.message;

    if (error.name === 'AbortError' || error.message === 'Timeout' || error.message.toLowerCase().includes('timeout') || error.message.toLowerCase().includes('abort')) {
      friendlyMsg = 'Connection Timeout: The system could not reach your phone. Is it on the same WiFi?';
    } else if (error.message.includes('ECONNREFUSED')) {
      friendlyMsg = "Connection Refused: Your phone is on the network, but the 'SMS Gateway' app is not running or the port is wrong.";
    } else if (error.message.includes('ENETUNREACH') || error.message.includes('EHOSTUNREACH')) {
      friendlyMsg = 'Network Unreachable: Cannot find the path to the phone IP. Check your WiFi connection.';
    } else if (error.message.includes('Gateway Rejected')) {
      friendlyMsg = error.message;
    }

    // Always log in worker mode so failures are visible in terminal
    // console.error(`[SMS-FAIL] ${isWorker ? '[WORKER] ' : ''}Send to ${number} failed: ${error.message}`);

    // ─── Automated Queuing Fallback (non-worker, non-PING only) ───
    if (message !== 'PING' && !isWorker) {
      try {
        const safeName = (recipientName || 'System').toString();
        db.prepare('INSERT INTO sms_queue (number, message, recipient_name, status, broadcast_id) VALUES (?, ?, ?, ?, ?)').run(number, message, safeName, 'pending', broadcastId);
        console.log(`[SMS-QUEUE] Message to ${number} queued for retry.`);
        return { success: true, queued: true, error: 'Phone Offline (Saved to queue for later)' };
      } catch (qErr) {
        console.error('[SMS-QUEUE] Critical Error saving to DB:', qErr.message);
      }
    }

    return { success: false, error: friendlyMsg, raw: error.message };
  }
}


module.exports = {
  sendSMS,
  /**
   * Manually queue a message (used if higher-level logic knows we are offline)
   */
  queueSMS: (number, message, recipientName = 'System', broadcastId = null) => {
    try {
      const safeName = (recipientName || 'System').toString();
      db.prepare('INSERT INTO sms_queue (number, message, recipient_name, status, broadcast_id) VALUES (?, ?, ?, ?, ?)').run(number, message, safeName, 'pending', broadcastId);
      console.log(`[SMS-QUEUE] Queued message to ${number}`);
      return true;
    } catch (e) {
      console.error('[SMS-QUEUE] Failed to queue:', e.message);
      return false;
    }
  }
};
