require('dotenv').config();
const { RouterOSClient } = require('routeros-client');

async function verifyRouter() {
    console.log(`🔍 Connecting to MikroTik at ${process.env.MIKROTIK_HOST}...`);
    const api = new RouterOSClient({
        host: process.env.MIKROTIK_HOST,
        user: process.env.MIKROTIK_USER,
        password: process.env.MIKROTIK_PASSWORD,
        port: parseInt(process.env.MIKROTIK_PORT),
        timeout: 5000
    });

    try {
        const client = await api.connect();
        console.log('✅ Connected successfully!');

        console.log('\n--- Default Routes ---');
        const routes = await client.menu('/ip route').where('dst-address', '0.0.0.0/0').get();
        routes.forEach(r => {
            const status = r.active === 'true' ? 'ACTIVE' : 'inactive';
            console.log(`[${status}] Destination: 0.0.0.0/0, Gateway: ${r.gateway}, Distance: ${r.distance}, Comment: ${r.comment || 'N/A'}`);
        });

        console.log('\n--- Health & Connectivity Check ---');
        
        // Ping Starlink (Local Gateway)
        const pingStarlink = await client.menu('/ping').args({ address: '192.168.2.1', count: 1 }).getOnly();
        console.log(`Ping Starlink (192.168.2.1): ${pingStarlink.received}/${pingStarlink.sent} received, RTT: ${pingStarlink['avg-rtt'] || 'N/A'}`);

        // Ping PLDT (Main Gateway)
        const pingPLDT = await client.menu('/ping').args({ address: '192.168.100.1', count: 1 }).getOnly();
        console.log(`Ping PLDT (192.168.100.1): ${pingPLDT.received}/${pingPLDT.sent} received, RTT: ${pingPLDT['avg-rtt'] || 'N/A'}`);

        // Ping Global Internet
        const pingGoogle = await client.menu('/ping').args({ address: '8.8.8.8', count: 1 }).getOnly();
        console.log(`Ping Google (8.8.8.8): ${pingGoogle.received}/${pingGoogle.sent} received, RTT: ${pingGoogle['avg-rtt'] || 'N/A'}`);

        await api.close();
    } catch (e) {
        console.error('❌ Connection failed:', e.message);
    }
}

verifyRouter();
