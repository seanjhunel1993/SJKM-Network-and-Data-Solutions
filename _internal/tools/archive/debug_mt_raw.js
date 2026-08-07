const mikrotik = require('./mikrotik');

async function debugSecrets() {
    try {
        mikrotik.host = '192.168.2.78';
        mikrotik.pass = 'user1234'; 
        await mikrotik.connect();
        
        console.log('📡 Fetching raw secrets for debugging...');
        const raw = await mikrotik.client.menu('/ppp secret').get();
        console.log('--- RAW SAMPLE (First 2) ---');
        console.log(JSON.stringify(raw.slice(0, 2), null, 2));
        
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
debugSecrets();
