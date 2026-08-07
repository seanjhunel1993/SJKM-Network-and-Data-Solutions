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
    console.log('📡 Connecting to MikroTik at ' + api.host + '...');
    const client = await api.connect();
    console.log('✅ Connected! Pulling recent logs...');

    console.log('\n=========================================');
    console.log('📰 RECENT PPPoE & SYSTEM DISCONNECTION LOGS');
    console.log('=========================================');
    const logs = await client.menu('/log').get();
    
    // Filter logs for disconnects or pppoe
    const pppLogs = logs.filter(l => 
      l.message.toLowerCase().includes('pppoe') || 
      l.message.toLowerCase().includes('disconnect') ||
      l.message.toLowerCase().includes('logged out') ||
      l.topics.includes('ppp')
    );

    // Get last 50 relevant logs
    const recentLogs = pppLogs.slice(-50);
    if (recentLogs.length === 0) {
      console.log('No recent PPPoE disconnect logs found.');
    } else {
      recentLogs.forEach(l => {
        console.log(`[${l.time}] [${l.topics}] -> ${l.message}`);
      });
    }

    await client.close();
  } catch (err) {
    console.error('❌ Log Pull Error:', err);
  }
}

run();
