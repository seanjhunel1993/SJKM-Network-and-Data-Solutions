require('dotenv').config();
const { RouterOSClient } = require('routeros-client');

async function diagnosePLDT() {
    const api = new RouterOSClient({
        host: process.env.MIKROTIK_HOST,
        user: process.env.MIKROTIK_USER,
        password: process.env.MIKROTIK_PASSWORD,
        port: parseInt(process.env.MIKROTIK_PORT),
        timeout: 10000
    });

    try {
        const client = await api.connect();
        console.log('--- PLDT DIAGNOSIS (Ping Fixed) ---');

        // Check if gateway is reachable via terminal command call
        // routeros-client usually uses .command() or similar for non-menu items but for /ping it's a menu
        // Actually, for ping, we can use client.write() or client.menu('/ping').get() with params
        
        console.log('\n--- PINGING PLDT Gateway (192.168.100.1) ---');
        const resPLDT = await client.write(['/ping', '=address=192.168.100.1', '=count=3']);
        console.log(JSON.stringify(resPLDT));

        console.log('\n--- PINGING Starlink Gateway (192.168.2.1) ---');
        const resSL = await client.write(['/ping', '=address=192.168.2.1', '=count=3']);
        console.log(JSON.stringify(resSL));

        console.log('\n--- PINGING Google (8.8.8.8) via PLDT interface ---');
        const resGooglePLDT = await client.write(['/ping', '=address=8.8.8.8', '=count=3', '=interface=ether2- PLDT']);
        console.log(JSON.stringify(resGooglePLDT));

        await api.close();
    } catch (e) {
        console.error('❌ Connection failed:', e.message);
    }
}

diagnosePLDT();
