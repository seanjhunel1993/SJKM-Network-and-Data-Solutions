const { RouterOSClient } = require('routeros-client');

async function test() {
  console.log("Connecting...");
  const api = new RouterOSClient({
    host: '192.168.2.78',
    user: 'admin',
    password: 'user1234',
    port: 8728,
    timeout: 3000
  });

  try {
    const client = await api.connect();
    console.log("Connected!");
    
    console.log("Getting /ppp active...");
    const active = await client.menu('/ppp active').get();
    console.log("Found Active:", active.length);
    console.log(JSON.stringify(active, null, 2));

    api.close();
  } catch (e) {
    console.error("Error:", e.message);
  }
}

test();
