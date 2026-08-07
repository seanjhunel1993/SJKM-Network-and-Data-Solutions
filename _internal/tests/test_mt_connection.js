require('dotenv').config();
const mikrotik = require('./mikrotik');

async function testConnection() {
    console.log(`🚀 Testing connection to ${process.env.MIKROTIK_HOST}:${process.env.MIKROTIK_PORT}...`);
    try {
        const success = await mikrotik.connect();
        if (success) {
            console.log('✅ Port connection successful!');
            
            // Fetch real data to prove it's working
            const active = await mikrotik.getActivePPPoE();
            console.log(`📊 Total Active PPPoE Sessions Found: ${active.length}`);
            
            if (active.length > 0) {
                console.log('--- Sample Active Session ---');
                console.log(`User: ${active[0].name}, IP: ${active[0].address}, Uptime: ${active[0].uptime}`);
            }

            // Check Cloud DNS
            try {
                const cloud = await mikrotik.client.menu('/ip cloud').getOnly();
                if (cloud && cloud['dns-name']) {
                    console.log(`🌐 MIKROTIK CLOUD DNS: ${cloud['dns-name']}`);
                    console.log('💡 TIP: Use this hostname in .env for redundant remote access!');
                }
            } catch (e) {
                console.log('ℹ️ Router Cloud DNS logic skipped (maybe disabled).');
            }

            await mikrotik.api.close();
            console.log('\n🏁 TEST COMPLETE: RE-SYNC SUCCESSFUL.');
        } else {
            console.log('❌ Connection failed. Please check your credentials in .env.');
        }
    } catch (err) {
        console.error('❌ Diagnostic Critical Error:', err.message);
    }
}

testConnection();
