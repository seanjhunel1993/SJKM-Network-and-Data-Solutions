require('dotenv').config();
const mikrotik = require('./mikrotik');

async function testConnection() {
  const connected = await mikrotik.connect();
  if (connected) {
    console.log('Successfully connected to MikroTik!');
    try {
      const interfaces = await mikrotik.client.menu('/interface').get();
      console.log('Interfaces found:', interfaces.map(i => i.name).join(', '));
      
      const routes = await mikrotik.client.menu('/ip route').get();
      console.log('Current Default Routes:', routes.filter(r => r['dst-address'] === '0.0.0.0/0').map(r => r.comment || r.gateway));
    } catch (e) {
      console.error('Error listing info:', e.message);
    }
  } else {
    console.log('Failed to connect.');
  }
}

testConnection();
