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
        console.log('--- PLDT DIAGNOSIS ---');

        // Check Routes
        const routes = await client.menu('/ip/route').where('dst-address', '0.0.0.0/0').get();
        console.log('\nDefault Routes:');
        routes.forEach(r => {
            console.log(`- [Active: ${r.active}] Gateway: ${r.gateway}, Distance: ${r.distance}, Table: ${r.routingTable || 'main'}, check-gateway: ${r['check-gateway'] || 'none'}`);
        });

        // Ping Gateways
        console.log('\nGateway Health:');
        try {
            const resPLDT = await client.menu('/ping').args({ address: '192.168.100.1', count: 3 }).getOnly();
            console.log(`PLDT (192.168.100.1): ${resPLDT.received}/${resPLDT.sent} received. Avg RTT: ${resPLDT['avg-rtt'] || 'N/A'}`);
        } catch (e) {
            console.log(`PLDT (192.168.100.1): PING FAILED - ${e.message}`);
        }

        try {
            const resStarlink = await client.menu('/ping').args({ address: '192.168.2.1', count: 3 }).getOnly();
            console.log(`Starlink (192.168.2.1): ${resStarlink.received}/${resStarlink.sent} received. Avg RTT: ${resStarlink['avg-rtt'] || 'N/A'}`);
        } catch (e) {
            console.log(`Starlink (192.168.2.1): PING FAILED - ${e.message}`);
        }

        // Check Interface Ethernet Status
        console.log('\nInerface IP assignment:');
        const addr = await client.menu('/ip/address').get();
        addr.forEach(a => {
            if (a.interface.includes('PLDT') || a.interface.includes('STARLINK')) {
                console.log(`- ${a.interface}: ${a.address}`);
            }
        });

        await api.close();
    } catch (e) {
        console.error('❌ Connection failed:', e.message);
    }
}

diagnosePLDT();
