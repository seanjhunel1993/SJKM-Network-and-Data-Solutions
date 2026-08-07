require('dotenv').config();
const { RouterOSClient } = require('routeros-client');

async function findPLDTGateway() {
    const api = new RouterOSClient({
        host: process.env.MIKROTIK_HOST,
        user: process.env.MIKROTIK_USER,
        password: process.env.MIKROTIK_PASSWORD,
        port: parseInt(process.env.MIKROTIK_PORT),
        timeout: 10000
    });

    try {
        const client = await api.connect();
        console.log('--- PLDT DISCOVERY ---');

        const scanIPs = ['192.168.1.1', '192.168.100.1', '192.168.18.1', '10.0.0.1'];
        for (const ip of scanIPs) {
            console.log(`Pinging ${ip}...`);
            const res = await client.write(['/ping', `=address=${ip}`, '=count=2']);
            // If any ping returned a result with received > 0
            const success = res.some(r => parseInt(r.received) > 0);
            if (success) {
                 console.log(`✨ FOUND ACTIVE GATEWAY: ${ip}`);
            }
        }

        // Also check if ether2 is getting anything via ARP
        const arp = await client.menu('/ip/arp').get();
        console.log('\n--- ARP TABLE ---');
        arp.forEach(entry => {
            if (entry.interface === 'ether2- PLDT') {
                console.log(`ARP on PLDT: ${entry.address} (${entry['mac-address']})`);
            }
        });

        await api.close();
    } catch (e) {
        console.error('❌ Discovery failed:', e.message);
    }
}

findPLDTGateway();
