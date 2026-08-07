const Database = require('better-sqlite3');
const { RouterOSClient } = require('routeros-client');
require('dotenv').config();

async function run() {
    const api = new RouterOSClient({
        host: process.env.MIKROTIK_HOST || '192.168.88.1',
        user: process.env.MIKROTIK_USER || 'admin',
        password: process.env.MIKROTIK_PASSWORD || process.env.MIKROTIK_PASS || '',
        port: parseInt(process.env.MIKROTIK_PORT) || 8728,
        keepalive: false
    });

    try {
        const client = await api.connect();
        const sessions = await client.menu('/ppp/active').where('service', 'pppoe').get();
        console.log('--- PPP ACTIVE SESSIONS ---');
        console.log(sessions.slice(0, 3)); // Print first 3 sessions to see all fields
        await api.close();
    } catch (e) {
        console.error('Error:', e.message);
    }
}

run();
