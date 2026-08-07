const { RouterOSClient } = require('routeros-client');
require('dotenv').config();

async function run() {
    const api = new RouterOSClient({
        host: process.env.MIKROTIK_HOST || '192.168.30.1',
        user: process.env.MIKROTIK_USER || 'admin',
        password: process.env.MIKROTIK_PASSWORD || '',
        port: 8728
    });

    let client;
    try {
        client = await api.connect();
        console.log('✅ Connected to MikroTik');

        // --- STAGE 1: Interface Renaming (USING PHYSICAL DEFAULT NAMES) ---
        console.log('🔄 Renaming physical ports by mapping...');
        const interfaces = await client.menu('/interface/ethernet').get();
        const baseInterfaces = await client.menu('/interface').get();

        const map = {
            'ether1': 'ether1-PLDT',
            'ether2': 'ether2-STARLINK',
            'ether3': 'ether3-PISOWIFI',
            'ether4': 'ether4-HOME-ROUTER'
        };

        for (const eth of interfaces) {
            const targetName = map[eth.defaultName];
            if (targetName) {
                // Find the ID in the base /interface menu for renaming
                const baseInt = baseInterfaces.find(i => i['default-name'] === eth.defaultName);
                if (baseInt && baseInt.name !== targetName) {
                    try {
                        await client.menu('/interface').set(baseInt['.id'], { name: targetName });
                        console.log(`✅ Renamed ${eth.defaultName} to ${targetName}`);
                    } catch (e) {
                         // Some firmwares use different naming for default-name field
                         console.warn(`⚠️ Could not rename ${eth.defaultName}:`, e.message);
                    }
                } else if (baseInt) {
                    console.log(`ℹ️ Port ${eth.defaultName} is already correctly named.`);
                }
            }
        }

        // Handle Port 5 (PPPOE ETH5)
        const pppoeBridge = baseInterfaces.find(i => i.name.includes('PPPOE') || i['default-name'] === 'ether5');
        if (pppoeBridge && pppoeBridge.name !== 'PPPOE ETH5') {
            try {
                await client.menu('/interface').set(pppoeBridge['.id'], { name: 'PPPOE ETH5' });
                console.log('✅ Renamed customer port to PPPOE ETH5');
            } catch (e) { console.warn('⚠️ Could not rename PPPOE ETH5:', e.message); }
        }

        // --- STAGE 2: Smart Failover (Recursive) ---
        console.log('🛡️ Setting up Recursive Failover...');
        
        // Remove old routes safely (ONLY STATIC ROUTES with relevant comments)
        const currentRoutes = await client.menu('/ip route').get();
        for (const r of currentRoutes) {
            const comment = r.comment || '';
            const isStatic = r.dynamic === 'false' || r.dynamic === false;
            
            if (isStatic && (comment.includes('PLDT') || comment.includes('STARLINK') || comment.includes('FIXED') || comment.includes('Emergency') || comment.includes('Target'))) {
                try {
                    await client.menu('/ip route').remove(r['.id']);
                    console.log(`🗑️ Removed static route: ${comment}`);
                } catch (e) { console.warn(`⚠️ Could not remove route ${comment}:`, e.message); }
            }
        }

        // Setup DHCP clients
        const dhcpClients = await client.menu('/ip dhcp-client').get();
        for (const dc of dhcpClients) {
            if (dc.interface.includes('ether1')) {
                try {
                    await client.menu('/ip dhcp-client').set(dc['.id'], { 'add-default-route': 'no', comment: 'PLDT-WAN' });
                    console.log('✅ Updated PLDT DHCP client');
                } catch (e) { console.warn('⚠️ Could not update PLDT DHCP client:', e.message); }
            }
            if (dc.interface.includes('ether2')) {
                try {
                    await client.menu('/ip dhcp-client').set(dc['.id'], { 'add-default-route': 'no', comment: 'STARLINK-WAN' });
                    console.log('✅ Updated STARLINK DHCP client');
                } catch (e) { console.warn('⚠️ Could not update STARLINK DHCP client:', e.message); }
            }
        }

        // Add Recursive Targets
        try {
            await client.menu('/ip route').add({ 'dst-address': '8.8.8.8', gateway: 'ether1-PLDT', scope: '10', comment: 'Target-PLDT' });
            await client.menu('/ip route').add({ 'dst-address': '1.1.1.1', gateway: 'ether2-STARLINK', scope: '10', comment: 'Target-Starlink' });
            console.log('✅ Target routes added');
        } catch (e) { console.warn('⚠️ Could not add target routes (maybe exist):', e.message); }

        // Add Default Routes
        try {
            await client.menu('/ip route').add({ distance: '1', gateway: '8.8.8.8', 'check-gateway': 'ping', 'target-scope': '10', comment: 'Main-PLDT-Recursive' });
            await client.menu('/ip route').add({ distance: '2', gateway: '1.1.1.1', 'check-gateway': 'ping', 'target-scope': '10', comment: 'Backup-Starlink-Recursive' });
            console.log('✅ Recursive default routes added');
        } catch (e) { console.warn('⚠️ Could not add recursive default routes:', e.message); }

        // --- STAGE 3: Anti-Lag (QoS) ---
        console.log('🚀 Implementing Anti-Lag QoS...');
        
        // Mangle Rules
        const currentMangles = await client.menu('/ip firewall mangle').get();
        for (const m of currentMangles) {
            const comment = m.comment || '';
            if (comment.includes('Priority') || comment.includes('FIX: PPPoE')) {
                try {
                    await client.menu('/ip firewall mangle').remove(m['.id']);
                    console.log(`🗑️ Removed mangle rule: ${comment}`);
                } catch (e) { console.warn(`⚠️ Could not remove mangle ${comment}:`, e.message); }
            }
        }

        try {
            await client.menu('/ip firewall mangle').add({ chain: 'postrouting', action: 'mark-packet', 'new-packet-mark': 'p1_priority', passthrough: 'no', protocol: 'tcp', 'tcp-flags': 'ack', 'packet-size': '0-123', comment: 'Priority: ACK' });
            await client.menu('/ip firewall mangle').add({ chain: 'postrouting', action: 'mark-packet', 'new-packet-mark': 'p1_priority', passthrough: 'no', protocol: 'udp', 'dst-port': '5000-5700,10000-10500,3074,3075,17000-20000', comment: 'Priority: Games' });
            await client.menu('/ip firewall mangle').add({ chain: 'forward', action: 'change-mss', 'new-mss': '1440', passthrough: 'yes', protocol: 'tcp', 'tcp-flags': 'syn', 'tcp-mss': '1441-65535', 'in-interface': 'PPPOE ETH5', comment: 'FIX: PPPoE Speed' });
            await client.menu('/ip firewall mangle').add({ chain: 'forward', action: 'change-mss', 'new-mss': '1440', passthrough: 'yes', protocol: 'tcp', 'tcp-flags': 'syn', 'tcp-mss': '1441-65535', 'out-interface': 'PPPOE ETH5', comment: 'FIX: PPPoE Speed' });
            console.log('✅ Mangle rules added');
        } catch (e) { console.warn('⚠️ Could not add mangle rules:', e.message); }

        // Queue Tree
        const currentQueues = await client.menu('/queue tree').get();
        for (const q of currentQueues) {
            if (q.name.includes('P1_Games') || q.name.includes('P2_Others')) {
                try {
                    await client.menu('/queue tree').remove(q['.id']);
                    console.log(`🗑️ Removed queue: ${q.name}`);
                } catch (e) { console.warn(`⚠️ Could not remove queue ${q.name}:`, e.message); }
            }
        }
        try {
            await client.menu('/queue tree').add({ name: 'P1_Games', parent: 'PPPOE ETH5', 'packet-mark': 'p1_priority', priority: '1', queue: 'default' });
            await client.menu('/queue tree').add({ name: 'P2_Others', parent: 'PPPOE ETH5', 'packet-mark': 'no-mark', priority: '8', queue: 'default' });
            console.log('✅ Queue tree added');
        } catch (e) { console.warn('⚠️ Could not add queue tree:', e.message); }

        console.log('✅ All optimizations applied successfully!');

    } catch (err) {
        console.error('❌ Critical Error:', err.message);
    } finally {
        if (client) await api.close();
    }
}

run();
