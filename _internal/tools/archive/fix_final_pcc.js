require('dotenv').config();
const { RouterOSClient } = require('routeros-client');

async function fixPCC() {
    const api = new RouterOSClient({
        host: process.env.MIKROTIK_HOST,
        user: process.env.MIKROTIK_USER,
        password: process.env.MIKROTIK_PASSWORD,
        port: parseInt(process.env.MIKROTIK_PORT),
        timeout: 10000
    });

    try {
        const client = await api.connect();
        console.log('✅ Connected to MikroTik. Applying PCC/Failover fixes...');

        const routeMenu = client.menu('/ip/route');

        // 1. Clean up existing default routes to ensure a clean state
        const existingDefaults = await routeMenu.get();
        for (const r of existingDefaults) {
            if (r.dstAddress === '0.0.0.0/0' || r['dst-address'] === '0.0.0.0/0') {
                console.log(`🗑️ Removing old default route: ${r.gateway} (Table: ${r.routingTable || 'main'})`);
                await routeMenu.remove(r['.id'] || r.id);
            }
        }

        // 2. Add Main Table Routes (Failover)
        console.log('➕ Adding MAIN table routes (PLDT=1, Starlink=2)...');
        await routeMenu.add({
            'dst-address': '0.0.0.0/0',
            gateway: '192.168.100.1',
            distance: '1',
            'check-gateway': 'ping',
            comment: 'ISP1-PLDT-MAIN'
        });
        await routeMenu.add({
            'dst-address': '0.0.0.0/0',
            gateway: '192.168.2.1',
            distance: '2',
            'check-gateway': 'ping',
            comment: 'ISP2-STARLINK-BACKUP'
        });

        // 3. Add PCC Specific Table Routes
        console.log('➕ Adding ISP1 routing table (PLDT)...');
        await routeMenu.add({
            'dst-address': '0.0.0.0/0',
            gateway: '192.168.100.1',
            'routing-table': 'ISP1',
            'check-gateway': 'ping',
            comment: 'PCC-ISP1'
        });

        console.log('➕ Adding ISP2 routing table (Starlink)...');
        await routeMenu.add({
            'dst-address': '0.0.0.0/0',
            gateway: '192.168.2.1',
            'routing-table': 'ISP2',
            'check-gateway': 'ping',
            comment: 'PCC-ISP2'
        });

        console.log('\n✅ ALL ROUTES REBUILT SUCCESSFULLY!');

        // 4. Verification Ping
        console.log('\n--- Final Connection Test ---');
        const pingTest = await client.menu('/ping').args({ address: '8.8.8.8', count: 3 }).getOnly();
        console.log(`Global Ping Status: ${pingTest.received}/${pingTest.sent} received.`);

        await api.close();
    } catch (e) {
        console.error('❌ FIX FAILED:', e.message);
    }
}

fixPCC();
