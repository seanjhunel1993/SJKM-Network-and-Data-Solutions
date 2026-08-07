require('dotenv').config();
const mikrotik = require('./mikrotik');

async function debug() {
    await mikrotik.connect();
    const interfaces = await mikrotik.client.menu('/interface').get();
    const pppoe = interfaces.find(i => i.name.includes('pppoe'));
    if (pppoe) {
        console.log('--- PPPoE Interface Keys ---');
        console.log(Object.keys(pppoe));
        console.log('--- Sample Values ---');
        console.log('name:', pppoe.name);
        console.log('rx-byte:', pppoe['rx-byte']);
        console.log('tx-byte:', pppoe['tx-byte']);
    } else {
        console.log('No PPPoE interface found.');
    }
    process.exit(0);
}
debug();
