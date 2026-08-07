require('dotenv').config();
const { RouterOSClient } = require('routeros-client');

async function fixPLDT() {
    const api = new RouterOSClient({
        host: process.env.MIKROTIK_HOST,
        user: process.env.MIKROTIK_USER,
        password: process.env.MIKROTIK_PASSWORD,
        port: parseInt(process.env.MIKROTIK_PORT),
        timeout: 10000
    });

    try {
        const client = await api.connect();
        console.log('✅ Connected. Switching PLDT to DHCP...');

        // 1. Remove Static IP from PLDT interface
        console.log('🗑️ Removing static IP 192.168.100.3...');
        await client.menu('/ip/address').remove([find interface="ether2- PLDT"]);
        // Wait, the .remove() might need an ID.
        const addrs = await client.menu('/ip/address').where('interface', 'ether2- PLDT').get();
        for (const a of addrs) {
            await client.menu('/ip/address').remove(a['.id'] || a.id);
        }

        // 2. Add DHCP Client
        console.log('➕ Adding DHCP Client on ether2- PLDT...');
        await client.menu('/ip/dhcp-client').add({
            interface: 'ether2- PLDT',
            'add-default-route': 'no',
            'use-peer-dns': 'no',
            disabled: 'no',
            comment: 'PLDT-AUTO-CONFIG'
        });

        console.log('⏳ Waiting 5 seconds for DHCP to bind...');
        await new Promise(r => setTimeout(r, 5000));

        // 3. Get new IP
        const dhcp = await client.menu('/ip/dhcp-client').where('interface', 'ether2- PLDT').getOnly();
        if (dhcp.status === 'bound') {
            const newIP = dhcp.address.split('/')[0];
            const subnet = newIP.substring(0, newIP.lastIndexOf('.'));
            const gateway = subnet + '.1';
            
            console.log(`✨ BEYOND BOUND! New IP: ${newIP}, Gateway: ${gateway}`);
            
            // 4. Update Routes with NEW gateway
            console.log(`⚙️  Updating routing tables to use ${gateway}...`);
            const routes = await client.menu('/ip/route').get();
            for (const r of routes) {
                // If it's a default route for PLDT (Comment was ISP1-PLDT-MAIN or PCC-ISP1)
                if ((r.comment && (r.comment.includes('PLDT') || r.comment.includes('ISP1'))) && (r.dstAddress === '0.0.0.0/0' || r['dst-address'] === '0.0.0.0/0')) {
                    console.log(`🔄 Updating route ${r['.id'] || r.id} to gateway ${gateway}`);
                    await client.menu('/ip/route').set({ gateway: gateway }, r['.id'] || r.id);
                }
            }
            console.log('✅ Configuration Update Complete!');
        } else {
            console.warn(`⚠️  DHCP Status: ${dhcp.status}. Link might be dead at L2.`);
        }

        await api.close();
    } catch (e) {
        console.error('❌ FIX FAILED:', e.message);
    }
}

fixPLDT();
