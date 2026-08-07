require('dotenv').config();
const { RouterOSClient } = require('routeros-client');

async function findRouter() {
  const hosts = ['192.168.2.1', '192.168.30.1', '192.168.88.1', '192.168.1.1'];
  const user = process.env.MIKROTIK_USER;
  const password = process.env.MIKROTIK_PASSWORD;
  const port = parseInt(process.env.MIKROTIK_PORT) || 8728;

  for (const host of hosts) {
    console.log(`🔍 Trying to connect to ${host}...`);
    try {
      const api = new RouterOSClient({ host, user, password, port, timeout: 2000 });
      const client = await api.connect();
      console.log(`✅ Successfully connected to ${host}!`);
      
      const interfaces = await client.menu('/interface').get();
      console.log('Interfaces found:', interfaces.map(i => i.name).join(', '));
      
      const routes = await client.menu('/ip route').where('dst-address', '0.0.0.0/0').get();
      console.log('Default routes:', routes.map(r => r.comment || r.gateway));
      
      await api.close();
      return host;
    } catch (e) {
      console.log(`❌ Failed: ${e.message}`);
    }
  }
  return null;
}

findRouter();
