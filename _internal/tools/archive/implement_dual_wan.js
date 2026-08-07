require('dotenv').config();
const mikrotik = require('./mikrotik');

async function implementConfig() {
  const connected = await mikrotik.connect();
  if (!connected) return;

  const client = mikrotik.client;
  
  try {
    // 1. Rename Interfaces for clarity
    console.log('🔄 Renaming interfaces...');
    const iface1StarlinkExisting = await client.menu('/interface').where('name', 'ether1-STARLINK').getOnly();
    if (!iface1StarlinkExisting) {
      const iface1 = await client.menu('/interface').where('name', 'ether1-PLDT').getOnly();
      if (iface1) {
        await client.menu('/interface').update({ name: 'ether1-STARLINK' }, iface1['.id']);
        console.log('✅ ether1 renamed to ether1-STARLINK');
      }
    } else {
      console.log('ℹ️ ether1-STARLINK already exists.');
    }
    
    const iface2PLDTExisting = await client.menu('/interface').where('name', 'ether2-PLDT').getOnly();
    if (!iface2PLDTExisting) {
      const iface2 = await client.menu('/interface').where('name', 'ether2-PISOWIFI').getOnly();
      if (iface2) {
        await client.menu('/interface').update({ name: 'ether2-PLDT' }, iface2['.id']);
        console.log('✅ ether2 renamed to ether2-PLDT');
      }
    } else {
      console.log('ℹ️ ether2-PLDT already exists.');
    }

    // 2. Clear existing default routes
    console.log('🗑️ Clearing existing default routes...');
    const routes = await client.menu('/ip route').where('dst-address', '0.0.0.0/0').get();
    for (const r of routes) {
      await client.menu('/ip route').remove(r['.id']);
    }

    // 3. Add Recursive Routes
    console.log('🛤️ Adding recursive routes...');
    await client.menu('/ip route').add({ 'dst-address': '8.8.8.8', gateway: 'ether2-PLDT', scope: '10', comment: 'Check PLDT' });
    await client.menu('/ip route').add({ 'dst-address': '1.1.1.1', gateway: 'ether1-STARLINK', scope: '10', comment: 'Check Starlink' });
    await client.menu('/ip route').add({ distance: '1', gateway: '8.8.8.8', 'check-gateway': 'ping', 'target-scope': '10', comment: 'Main: PLDT' });
    await client.menu('/ip route').add({ distance: '2', gateway: '1.1.1.1', 'check-gateway': 'ping', 'target-scope': '10', comment: 'Backup: Starlink' });

    // 4. NAT / Masquerade
    console.log('🛡️ Adding NAT rules...');
    await client.menu('/ip firewall nat').add({ chain: 'srcnat', action: 'masquerade', 'out-interface': 'ether2-PLDT', comment: 'MASQ: PLDT' });
    await client.menu('/ip firewall nat').add({ chain: 'srcnat', action: 'masquerade', 'out-interface': 'ether1-STARLINK', comment: 'MASQ: STARLINK' });

    // 5. Anti-Lag & QoS (Mangle)
    console.log('⚡ Adding Anti-Lag rules...');
    await client.menu('/ip firewall mangle').add({ chain: 'postrouting', action: 'mark-packet', 'new-packet-mark': 'p1_priority', passthrough: 'no', protocol: 'tcp', 'tcp-flags': 'ack', 'packet-size': '0-123', comment: 'Priority 1: ACK' });
    await client.menu('/ip firewall mangle').add({ chain: 'postrouting', action: 'mark-packet', 'new-packet-mark': 'p1_priority', passthrough: 'no', protocol: 'udp', 'dst-port': '5000-5700,10000-10500,3074,3075,17000-20000', comment: 'Priority 1: Games' });

    // 6. Queue Tree (Targeting PPPOE ETH5)
    console.log('📊 Creating Queue Tree...');
    await client.menu('/queue tree').add({ name: 'Total_Download', parent: 'PPPOE ETH5', queue: 'default' });
    await client.menu('/queue tree').add({ name: 'Q1_Games', parent: 'Total_Download', 'packet-mark': 'p1_priority', priority: '1', queue: 'default' });
    await client.menu('/queue tree').add({ name: 'Q2_Other', parent: 'Total_Download', 'packet-mark': 'no-mark', priority: '8', queue: 'default' });

    // 7. MSS Clamping
    console.log('🔧 Applying MSS Clamping fix...');
    await client.menu('/ip firewall mangle').add({ chain: 'forward', action: 'change-mss', 'new-mss': '1440', passthrough: 'yes', protocol: 'tcp', 'tcp-flags': 'syn', 'tcp-mss': '1441-65535', 'in-interface': 'PPPOE ETH5', comment: 'FIX: PPPoE Slow Browsing' });
    await client.menu('/ip firewall mangle').add({ chain: 'forward', action: 'change-mss', 'new-mss': '1440', passthrough: 'yes', protocol: 'tcp', 'tcp-flags': 'syn', 'tcp-mss': '1441-65535', 'out-interface': 'PPPOE ETH5', comment: 'FIX: PPPoE Slow Browsing' });

    console.log('✅ All configurations applied successfully!');
  } catch (e) {
    console.error('❌ Error during implementation:', e.message);
  } finally {
    await mikrotik.api.close();
  }
}

implementConfig();
