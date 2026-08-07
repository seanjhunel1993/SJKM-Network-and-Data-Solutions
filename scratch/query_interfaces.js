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
        const interfaces = await client.menu('/interface').get();
        console.log('--- ALL INTERFACES ---');
        console.log(interfaces.slice(0, 15).map(i => ({ name: i.name, type: i.type, rx: i.rxByte || i['rx-byte'], tx: i.txByte || i['tx-byte'] })));
        await api.close();
    } catch (e) {
        console.error('Error:', e.message);
    }
}

run();
