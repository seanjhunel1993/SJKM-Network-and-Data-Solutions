const mikrotik = require('../mikrotik');
const db = require('../database');

async function testSync() {
    console.log('🔄 Starting Test Sync...');
    const secrets = await mikrotik.getPPPoESecrets();
    console.log(`📡 Received ${secrets.length} secrets.`);

    for (const s of secrets) {
        if (s.name === 'testing') { // One of the known decimal accounts
            console.log(`User: ${s.name} | Pass from MikroTik: "${s.password}" | Type: ${typeof s.password}`);
            const pass = String(s.password || '');
            console.log(`Cast to String: "${pass}"`);
            
            // Re-simulate the sync update
            const res = db.prepare("UPDATE clients SET pppoe_pass = ? WHERE pppoe_user = ?").run(pass, s.name);
            console.log(`DB Update Result: ${res.changes} row(s) updated.`);
            
            const verify = db.prepare("SELECT pppoe_pass FROM clients WHERE pppoe_user = ?").get(s.name);
            console.log(`Verified DB Content: "${verify.pppoe_pass}"`);
        }
    }
}

testSync();
