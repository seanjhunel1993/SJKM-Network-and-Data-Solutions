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
    const client = await api.connect();
    
    console.log('--- FIREWALL MANGLE RULES ---');
    const mangles = await client.menu('/ip/firewall/mangle').get();
    if (mangles.length === 0) {
      console.log('No mangle rules found.');
    } else {
      mangles.forEach((m, i) => {
        console.log(`[${i}] chain=${m.chain} action=${m.action} new-packet-mark=${m['new-packet-mark']||'N/A'} comment="${m.comment||''}"`);
      });
    }

    console.log('\n--- QUEUE TREE ---');
    const trees = await client.menu('/queue/tree').get();
    if (trees.length === 0) {
      console.log('No queue trees found.');
    } else {
      trees.forEach((t, i) => {
        console.log(`[${i}] name=${t.name} parent=${t.parent} packet-mark=${t['packet-mark']||'N/A'} priority=${t.priority}`);
      });
    }

    await client.close();
  } catch (err) {
    console.error('Error:', err);
  }
}
run();
