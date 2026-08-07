require('dotenv').config();
const mikrotik = require('./mikrotik');

async function debug() {
    console.log('📡 Connecting to MikroTik...');
    const connected = await mikrotik.connect();
    if (!connected) {
        console.error('❌ Failed to connect.');
        return;
    }

    console.log('🔍 Fetching /ppp active...');
    const activeResult = await mikrotik.client.menu('/ppp active').get();
    console.log('PPP Active Sessions Count:', activeResult.length);

    console.log('\n🔍 Fetching ALL interfaces...');
    const interfaces = await mikrotik.client.menu('/interface').get();
    console.log('All Interfaces Count:', interfaces.length);
    
    // Find pppoe specifically
    const pppoeIfaces = interfaces.filter(i => i.name.includes('pppoe'));
    console.log('\nPPPoE Specific Interfaces Found:', pppoeIfaces.length);
    if (pppoeIfaces.length > 0) {
        console.log('Sample Interface Names:', pppoeIfaces.slice(0, 5).map(i => i.name));
    }

    process.exit(0);
}

debug();
