const { RouterOSClient } = require('routeros-client');
require('dotenv').config();

async function run() {
  const api = new RouterOSClient({
    host: process.env.MIKROTIK_HOST || '30.30.30.1',
    user: process.env.MIKROTIK_USER || 'admin',
    password: process.env.MIKROTIK_PASSWORD || process.env.MIKROTIK_PASS || '',
    port: parseInt(process.env.MIKROTIK_PORT) || 8728,
  });

  try {
    console.log('📡 Connecting to MikroTik...');
    const client = await api.connect();
    console.log('✅ Connected!');

    console.log('\n--- 1. Fixing DHCP Client ---');
    const dhcpClients = await client.menu('/ip/dhcp-client').get();
    const ispDhcp = dhcpClients.find(c => c.interface === 'ether1-ISP1');
    if (ispDhcp) {
      console.log(`Found DHCP Client for ${ispDhcp.interface}. Updating use-peer-dns...`);
      await client.menu('/ip/dhcp-client').where('.id', ispDhcp['.id']).update({
        'use-peer-dns': 'yes'
      });
      console.log('✅ DHCP Client use-peer-dns set to yes.');
    } else {
      console.log('❌ Could not find DHCP Client for ether1-ISP1');
    }

    console.log('\n--- 2. Fixing NAT Masquerade Rule ---');
    const natRules = await client.menu('/ip/firewall/nat').get();
    const ispNat = natRules.find(r => r.action === 'masquerade' && r['out-interface'] === 'ether1-ISP1');
    if (ispNat) {
      console.log(`Found NAT Rule. Clearing src-address-list and out-interface-list...`);
      
      try {
        await client.write('/ip/firewall/nat/unset', [
          '=numbers=' + ispNat['.id'],
          '=value-name=src-address-list'
        ]);
        console.log('Cleared src-address-list.');
      } catch (e) {}

      try {
        await client.write('/ip/firewall/nat/unset', [
          '=numbers=' + ispNat['.id'],
          '=value-name=out-interface-list'
        ]);
        console.log('Cleared out-interface-list.');
      } catch (e) {}
      
      console.log('✅ NAT Rule cleaned up.');
    } else {
      console.log('❌ Could not find Masquerade NAT rule for ether1-ISP1');
    }

    await client.close();
    console.log('\n🎉 Fixes applied successfully!');
  } catch (err) {
    console.error('❌ Error applying fixes:', err);
  }
}

run();
