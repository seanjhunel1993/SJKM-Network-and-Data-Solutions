const { RouterOSClient } = require('routeros-client');
require('dotenv').config();

async function run() {
  const api = new RouterOSClient({
    host: process.env.MIKROTIK_HOST || '177.168.1.1',
    user: process.env.MIKROTIK_USER || 'admin',
    password: process.env.MIKROTIK_PASSWORD || process.env.MIKROTIK_PASS || '',
    port: parseInt(process.env.MIKROTIK_PORT) || 8728,
  });

  try {
    console.log('📡 Connecting to MikroTik...');
    const client = await api.connect();
    console.log('✅ Connected! Pulling interface link logs...');

    const logs = await client.menu('/log').get();
    
    // Filter logs for interface link status updates
    const linkLogs = logs.filter(l => 
      l.message.toLowerCase().includes('link down') || 
      l.message.toLowerCase().includes('link up') || 
      l.message.toLowerCase().includes('ether1')
    );

    console.log('\n=========================================');
    console.log('🔌 INTERFACE LINK LOGS (UP / DOWN)');
    console.log('=========================================');
    if (linkLogs.length === 0) {
      console.log('No physical interface flaps found in current logs.');
    } else {
      linkLogs.forEach(l => {
        console.log(`[${l.time}] [${l.topics}] -> ${l.message}`);
      });
    }

    await client.close();
  } catch (err) {
    console.error('❌ Error pulling link logs:', err);
  }
}

run();
