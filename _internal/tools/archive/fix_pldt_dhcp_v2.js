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
        console.log('🗑️  Removing existing static IP addresses from ether2- PLDT...');
        const addrs = await client.menu('/ip/address').where('interface', 'ether2- PLDT').get();
        for (const a of addrs) {
            console.log(`- Removing address: ${a.address}`);
            await client.menu('/ip/address').remove(a['.id'] || a.id);
        }

        // 2. Add DHCP Client
        console.log('➕ Adding DHCP Client on ether2- PLDT...');
        // Clean up any existing dhcp-client to avoid conflict
        const existingDHCP = await client.menu('/ip/dhcp-client').where('interface', 'ether2- PLDT').get();
        for (const d of existingDHCP) {
            await client.menu('/ip/dhcp-client').remove(d['.id'] || d.id);
        }

        await client.menu('/ip/dhcp-client').add({
            interface: 'ether2- PLDT',
            'add-default-route': 'no',
            'use-peer-dns': 'no',
            'use-peer-ntp': 'no',
            disabled: 'no',
            comment: 'PLDT-AUTO-CONFIG'
        });

        console.log('⏳ Waiting 10 seconds for DHCP status to bind...');
        for (let i = 0; i < 5; i++) {
            await new Promise(r => setTimeout(r, 2000));
            const dhcp = await client.menu('/ip/dhcp-client').where('interface', 'ether2- PLDT').getOnly().catch(() => null);
            if (dhcp) {
                console.log(`- DHCP Status: ${dhcp.status} Address: ${dhcp.address || 'none'}`);
                if (dhcp.status === 'bound') break;
            }
        }

        // 3. Final Check and Update Routes
        const finalDHCP = await client.menu('/ip/dhcp-client').where('interface', 'ether2- PLDT').getOnly();
        if (finalDHCP.status === 'bound') {
            const newIPFull = finalDHCP.address || '';
            const newIP = newIPFull.split('/')[0];
            const subnetParts = newIP.split('.');
            const gateway = `${subnetParts[0]}.${subnetParts[1]}.${subnetParts[2]}.1`;
            
            console.log(`✨ PLDT Gateway discovered at: ${gateway}`);
            
            // 4. Update Routes with NEW gateway
            console.log(`⚙️  Updating routing tables for PCC/Failover...`);
            const routes = await client.menu('/ip/route').where('dst-address', '0.0.0.0/0').get();
            for (const r of routes) {
                const comment = (r.comment || '').toUpperCase();
                if (comment.includes('PLDT') || comment.includes('ISP1')) {
                    console.log(`🔄 Updating route [${r.id || r['.id']}] Table: ${r.routingTable || 'main'} to Gateway: ${gateway}`);
                    // Use correct method to update route
                    await client.menu('/ip/route').update({ gateway: gateway }, r.id || r['.id']);
                }
            }
            console.log('✅ PLDT restoration complete. Checking traffic...');
        } else {
            console.warn(`⚠️  DHCP Status: ${finalDHCP.status}. Link is still not passing traffic.`);
        }

        await api.close();
    } catch (e) {
        console.error('❌ FIX FAILED:', e.message);
    }
}

fixPLDT();
