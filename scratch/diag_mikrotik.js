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
    console.log('📡 Connecting to MikroTik at ' + api.host + '...');
    const client = await api.connect();
    console.log('✅ Connected!');

    console.log('\n=========================================');
    console.log('🖥️ SYSTEM RESOURCE INFO');
    console.log('=========================================');
    const systemResource = await client.menu('/system/resource').get();
    console.log(JSON.stringify(systemResource[0], null, 2));

    console.log('\n=========================================');
    console.log('🔌 ETHERNET PORT STATUSES & ERRORS');
    console.log('=========================================');
    const eths = await client.menu('/interface/ethernet').get();
    for (const e of eths) {
      console.log(`Port: ${e.name}`);
      console.log(`  - MTU: ${e.mtu}`);
      console.log(`  - Speed: ${e.speed || 'unknown'}`);
      console.log(`  - Full Duplex: ${e['full-duplex']}`);
      console.log(`  - RX/TX Flow Control: ${e['rx-flow-control']}/${e['tx-flow-control']}`);
      
      try {
        const stats = await client.menu('/interface').where('name', e.name).get();
        if (stats && stats[0]) {
          console.log(`  - Rx Errors: ${stats[0]['rx-error'] || 0}`);
          console.log(`  - Tx Errors: ${stats[0]['tx-error'] || 0}`);
          console.log(`  - Rx Drops: ${stats[0]['rx-drop'] || 0}`);
          console.log(`  - Tx Drops: ${stats[0]['tx-drop'] || 0}`);
        }
      } catch (err) {
        console.log(`  - Error getting stats: ${err.message}`);
      }
    }

    console.log('\n=========================================');
    console.log('🔥 FIREWALL FILTER RULES (TOP 10)');
    console.log('=========================================');
    const firewall = await client.menu('/ip/firewall/filter').get();
    firewall.slice(0, 10).forEach((rule, idx) => {
      console.log(`${idx}: Action: ${rule.action}, Chain: ${rule.chain}, Protocol: ${rule.protocol || 'any'}, DST-Port: ${rule['dst-port'] || 'any'}, Bytes: ${rule.bytes}, Packets: ${rule.packets}, Disabled: ${rule.disabled}`);
    });

    console.log('\n=========================================');
    console.log('📶 ACTIVE CLIENTS IN QUEUES (FIRST 10)');
    console.log('=========================================');
    try {
      const queues = await client.menu('/queue/simple').get();
      queues.slice(0, 10).forEach(q => {
        console.log(`Queue: ${q.name}, Target: ${q.target}, Max Limit: ${q['max-limit']}, Bytes: ${q.bytes}`);
      });
    } catch (e) {
      console.log('No simple queues found or error: ' + e.message);
    }

    await client.close();
    console.log('\n🔌 Connection closed.');
  } catch (err) {
    console.error('❌ Error during diagnostics:', err);
  }
}

run();
