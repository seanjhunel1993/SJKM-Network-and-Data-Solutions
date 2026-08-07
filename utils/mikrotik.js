const { RouterOSClient } = require('routeros-client');
require('dotenv').config();

let api = null;
let connectedClient = null;
let connectPromise = null;

const cache = {
    activePPPoE: { data: null, timestamp: 0 },
    secrets: { data: null, timestamp: 0 }
};
const CACHE_TTL = 8000; // 8 seconds

async function connect() {
    if (connectedClient) return connectedClient;
    if (connectPromise) return connectPromise;

    // Check if MikroTik is disabled in database settings
    try {
        const db = require('../database');
        const settings = db.prepare('SELECT disable_mikrotik FROM settings WHERE id = 1').get();
        if (settings && settings.disable_mikrotik === 1) {
            throw new Error('MikroTik disabled in settings');
        }
    } catch (e) {
        if (e.message === 'MikroTik disabled in settings') throw e;
    }

    if (!api) {
        api = new RouterOSClient({
            host: process.env.MIKROTIK_HOST || '30.30.30.1',
            user: process.env.MIKROTIK_USER || 'admin',
            password: process.env.MIKROTIK_PASSWORD || process.env.MIKROTIK_PASS || '',
            port: parseInt(process.env.MIKROTIK_PORT) || 8728,
            keepalive: true
        });
        // 🛡️ CRITICAL: Prevent uncaught 'error' events (e.g. SOCKTMOUT) from
        // crashing the entire Node.js process when the router is offline.
        api.on('error', (err) => {
            const msg = (err && err.message) ? err.message : (typeof err === 'object' ? JSON.stringify(err) : String(err));
            console.error('📡 [MIKROTIK] Router connection error (handled):', msg);
            // Reset connection state so a retry will attempt a fresh connection.
            api = null;
            connectedClient = null;
        });
    }

    // Set a 1.5 second connection timeout to prevent UI hang when router is offline
    const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('MikroTik connection timeout')), 1500);
    });

    connectPromise = Promise.race([
        api.connect(),
        timeoutPromise
    ]).then(c => {
        connectedClient = c;
        connectPromise = null;
        console.log('📡 [MIKROTIK] Connected to router (' + (process.env.MIKROTIK_HOST || '192.168.88.1') + ')');
        return c;
    }).catch(err => {
        connectPromise = null;
        api = null; // force recreate on next try
        console.error('❌ [MIKROTIK] Connection error:', err.message || err);
        throw err;
    });

    return connectPromise;
}

function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function parseUptime(uptimeStr) {
    if (!uptimeStr) return 0;
    let seconds = 0;
    const weeks = uptimeStr.match(/(\d+)w/);
    const days = uptimeStr.match(/(\d+)d/);
    const hours = uptimeStr.match(/(\d+)h/);
    const minutes = uptimeStr.match(/(\d+)m/);
    const secs = uptimeStr.match(/(\d+)s/);
    
    if (weeks) seconds += parseInt(weeks[1]) * 7 * 24 * 3600;
    if (days) seconds += parseInt(days[1]) * 24 * 3600;
    if (hours) seconds += parseInt(hours[1]) * 3600;
    if (minutes) seconds += parseInt(minutes[1]) * 60;
    if (secs) seconds += parseInt(secs[1]);
    
    if (seconds === 0) {
        if (uptimeStr.includes(':')) {
            const parts = uptimeStr.split(':').map(Number);
            if (parts.length === 3) {
                seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
            } else if (parts.length === 2) {
                seconds = parts[0] * 60 + parts[1];
            }
        } else {
            seconds = parseInt(uptimeStr) || 0;
        }
    }
    return seconds;
}

const mikrotik = {
    get connected() { return !!connectedClient; },
    get host() { return process.env.MIKROTIK_HOST || 'OFFLINE'; },
    
    getSystemIdentity: async () => {
        try {
            const client = await connect();
            const result = await client.menu('/system/identity').get();
            return result[0]?.name || 'MikroTik Router';
        } catch (err) {
            return 'Offline';
        }
    },
    
    getActivePPPoE: async () => {
        if (Date.now() - cache.activePPPoE.timestamp < CACHE_TTL && cache.activePPPoE.data) {
            return cache.activePPPoE.data;
        }
        try {
            const client = await connect();
            const sessions = await client.menu('/ppp/active').where('service', 'pppoe').get();
            const interfaces = await client.menu('/interface').get();

            const interfaceMap = new Map();
            interfaces.forEach(i => {
                if (i.name) {
                    interfaceMap.set(i.name.toLowerCase(), i);
                }
            });

            const db = require('../database');
            const now = new Date();
            const currentMonthYear = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            const data = sessions.map(s => {
                const ifaceName = `<pppoe-${s.name.toLowerCase()}>`;
                const iface = interfaceMap.get(ifaceName);
                
                let rx = 0;
                let tx = 0;
                let mtu = '-';
                const username = s.name.toLowerCase().trim();
                const currentUptime = parseUptime(s.uptime);
                
                if (iface) {
                    rx = parseInt(iface.rxByte || iface['rx-byte']) || 0;
                    tx = parseInt(iface.txByte || iface['tx-byte']) || 0;
                    mtu = iface.actualMtu || iface.mtu || iface['actual-mtu'] || '-';
                    
                    let totalBytes = rx + tx;
                    
                    try {
                        let usageRecord = db.prepare('SELECT * FROM bandwidth_usage WHERE LOWER(pppoe_user) = ?').get(username);
                        
                        if (!usageRecord) {
                            db.prepare(`
                                INSERT INTO bandwidth_usage (pppoe_user, monthly_usage, last_session_rx, last_session_tx, last_uptime, month_year, hist_accum_rx, hist_accum_tx)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                            `).run(username, totalBytes, rx, tx, currentUptime, currentMonthYear, 0, 0);
                        } else if (usageRecord.month_year !== currentMonthYear) {
                            // Month has changed - reset history for new month
                            db.prepare(`
                                UPDATE bandwidth_usage
                                SET monthly_usage = ?, last_session_rx = ?, last_session_tx = ?, last_uptime = ?, month_year = ?, hist_accum_rx = 0, hist_accum_tx = 0
                                WHERE LOWER(pppoe_user) = ?
                            `).run(totalBytes, rx, tx, currentUptime, currentMonthYear, username);
                        } else {
                            // Only detect reconnection if we have valid non-zero stats and either:
                            // 1. Uptime decreased (100% reliable reconnect signal)
                            // 2. Both rx and tx decreased (counters reset on router side)
                            const bytesDecreased = (rx > 0 && rx < usageRecord.last_session_rx) || (tx > 0 && tx < usageRecord.last_session_tx);
                            const uptimeDecreased = currentUptime < usageRecord.last_uptime;
                            
                            if (bytesDecreased || uptimeDecreased) {
                                // Reset/Reconnection detected - accumulate the bytes of the previous session
                                const newHistRx = usageRecord.hist_accum_rx + usageRecord.last_session_rx;
                                const newHistTx = usageRecord.hist_accum_tx + usageRecord.last_session_tx;
                                totalBytes = newHistRx + newHistTx + rx + tx;
                                
                                db.prepare(`
                                    UPDATE bandwidth_usage
                                    SET monthly_usage = ?, last_session_rx = ?, last_session_tx = ?, last_uptime = ?, hist_accum_rx = ?, hist_accum_tx = ?
                                    WHERE LOWER(pppoe_user) = ?
                                `).run(totalBytes, rx, tx, currentUptime, newHistRx, newHistTx, username);
                            } else {
                                // Continuation of same session - update current totals and session stats
                                totalBytes = usageRecord.hist_accum_rx + usageRecord.hist_accum_tx + rx + tx;
                                
                                db.prepare(`
                                    UPDATE bandwidth_usage
                                    SET monthly_usage = ?, last_session_rx = ?, last_session_tx = ?, last_uptime = ?
                                    WHERE LOWER(pppoe_user) = ?
                                `).run(totalBytes, rx, tx, currentUptime, username);
                            }
                        }
                    } catch (dbErr) {
                        console.error('[BANDWIDTH_MONITOR] Database update error:', dbErr.message);
                    }
                }

                // Fallback to database recorded usage so far if interface is not found in this poll
                let displayUsage = '0 B';
                let displayBytes = 0;
                try {
                    let usageRecord = db.prepare('SELECT monthly_usage FROM bandwidth_usage WHERE LOWER(pppoe_user) = ?').get(username);
                    if (usageRecord && usageRecord.monthly_usage) {
                        displayBytes = usageRecord.monthly_usage;
                        displayUsage = formatBytes(displayBytes);
                    } else if (iface) {
                        displayBytes = rx + tx;
                        displayUsage = formatBytes(displayBytes);
                    }
                } catch(e) {}

                return {
                    name: s.name,
                    address: s.address,
                    uptime: s.uptime,
                    callerId: s.callerId || s['caller-id'],
                    mtu: mtu,
                    usage: displayUsage,
                    bytes: displayBytes
                };
            });
            cache.activePPPoE.data = data;
            cache.activePPPoE.timestamp = Date.now();
            return data;
        } catch (err) {
            if (err.message !== 'MikroTik disabled in settings') {
                console.error('[MIKROTIK] Failed to get active PPPoE:', err);
            }
            return cache.activePPPoE.data || [];
        }
    },
    
    getPPPoESecrets: async () => {
        if (Date.now() - cache.secrets.timestamp < CACHE_TTL && cache.secrets.data) {
            return cache.secrets.data;
        }
        try {
            const client = await connect();
            const secrets = await client.menu('/ppp/secret').where('service', 'pppoe').get();
            const data = secrets.map(s => ({
                name: s.name,
                password: s.password || '',
                profile: s.profile,
                disabled: s.disabled === 'true' || s.disabled === true,
                remoteAddress: s['remote-address'],
                comment: s.comment
            }));
            cache.secrets.data = data;
            cache.secrets.timestamp = Date.now();
            return data;
        } catch (err) {
            if (err.message !== 'MikroTik disabled in settings') {
                console.error('[MIKROTIK] Failed to get secrets:', err);
            }
            return cache.secrets.data || [];
        }
    },
    
    getTraffic: async () => {
        return { rx: 0, tx: 0, rawRx: 0, rawTx: 0 };
    },
    
    getPPPoEProfiles: async () => {
        try {
            const client = await connect();
            const profiles = await client.menu('/ppp/profile').get();
            return profiles.map(p => ({
                name: p.name,
                localAddress: p['local-address'],
                remoteAddress: p['remote-address'],
                rateLimit: p['rate-limit']
            }));
        } catch (err) {
            return [];
        }
    },

addPPPoESecret: async (name, password, profile, comment, service = 'pppoe') => {
        try {
            const client = await connect();
            const existing = await client.menu('/ppp/secret').where('name', name).get();
            if (existing && existing.length > 0) {
                // Secret already exists — update it instead
                console.log(`📡 [MIKROTIK] Secret [${name}] already exists. Updating instead.`);
                return await client.menu('/ppp/secret').where('name', name).set({
                    password: password,
                    profile: profile,
                    service: service,
                    comment: comment || '',
                    disabled: 'no'
                });
            }
            return await client.menu('/ppp/secret').add({
                name: name,
                password: password,
                profile: profile,
                service: service,
                comment: comment || '',
                disabled: 'no'
            });
        } catch (err) {
            console.error(`❌ [MIKROTIK] addPPPoESecret failed for [${name}]:`, err.message);
            return false;
        }
    },
    updatePPPoESecret: async (name, data) => {
        try {
            const client = await connect();
            const existing = await client.menu('/ppp/secret').where('name', name).get();
            if (!existing || existing.length === 0) {
                // Secret doesn't exist — create it
                console.log(`📡 [MIKROTIK] Secret [${name}] not found. Creating new.`);
                return await client.menu('/ppp/secret').add({
                    name: name,
                    password: data.password || '1234',
                    profile: data.profile || 'default',
                    service: data.service || 'pppoe',
                    comment: data.comment || '',
                    disabled: 'no'
                });
            }
            const updateData = {};
            if (data.password !== undefined) updateData.password = data.password;
            if (data.profile !== undefined) updateData.profile = data.profile;
            if (data.service !== undefined) updateData.service = data.service;
            if (data.comment !== undefined) updateData.comment = data.comment;
            if (data.disabled !== undefined) updateData.disabled = data.disabled;
            return await client.menu('/ppp/secret').where('name', name).set(updateData);
        } catch (err) {
            console.error(`❌ [MIKROTIK] updatePPPoESecret failed for [${name}]:`, err.message);
            return false;
        }
    },
    removePPPoESecret: async (name) => {
        try {
            const client = await connect();
            return await client.menu('/ppp/secret').where('name', name).remove();
        } catch (err) {
            console.error(`❌ [MIKROTIK] removePPPoESecret failed for [${name}]:`, err.message);
            return false;
        }
    },
    switchToUnpaid: async (name, profile) => {
        try {
            const client = await connect();
            const targetProfile = profile || 'SUSPENDED';
            // Change the profile to the unpaid/suspended profile
            await client.menu('/ppp/secret').where('name', name).set({ profile: targetProfile });
            // Enable the secret (so it's throttled but connectable) — good for captive portal
            await client.menu('/ppp/secret').where('name', name).set({ disabled: 'no' });
            // Kick the active session so the client reconnects with the new (unpaid) profile
            // This triggers the captive portal redirect on the unpaid subnet
            try {
                await client.menu('/ppp/active').where('name', name).remove();
            } catch (kickErr) {
                // No active session — fine
            }
            console.log(`📡 [MIKROTIK] ✅ [${name}] switched to profile [${targetProfile}]`);
            return true;
        } catch (err) {
            console.error(`📡 [MIKROTIK] ❌ switchToUnpaid failed for [${name}]:`, err.message);
            return false;
        }
    },
    restoreToPlan: async (name, profile) => {
        try {
            const client = await connect();
            const targetProfile = profile || 'default';
            // Change the profile back to the real plan
            await client.menu('/ppp/secret').where('name', name).set({ profile: targetProfile });
            // Ensure the secret is enabled
            await client.menu('/ppp/secret').where('name', name).set({ disabled: 'no' });
            // Kick the session so it reconnects with the real plan
            try {
                await client.menu('/ppp/active').where('name', name).remove();
            } catch (kickErr) {}
            console.log(`📡 [MIKROTIK] ✅ [${name}] restored to profile [${targetProfile}]`);
            return true;
        } catch (err) {
            console.error(`📡 [MIKROTIK] ❌ restoreToPlan failed for [${name}]:`, err.message);
            return false;
        }
    },
    reconnectUser: async (name) => {
        try {
            const client = await connect();
            await client.menu('/ppp/active').where('name', name).remove();
            console.log(`📡 [MIKROTIK] ⚡ [${name}] active session kicked.`);
            return true;
        } catch (err) {
            console.error(`📡 [MIKROTIK] ❌ reconnectUser (kick) failed for [${name}]:`, err.message);
            return false;
        }
    },
    getPPPoESecret: async (name) => {
        try {
            const client = await connect();
            const secrets = await client.menu('/ppp/secret').where('name', name).get();
            return secrets.length > 0 ? secrets[0] : null;
        } catch(e) { return null; }
    },
    
    formatBytes
};

module.exports = mikrotik;
