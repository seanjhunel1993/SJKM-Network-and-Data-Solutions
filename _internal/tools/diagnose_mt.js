require('dotenv').config();
const mt = require('./mikrotik');

async function test() {
    console.log('📡 Diagnostic starting for ' + process.env.MIKROTIK_HOST + '...');
    const connected = await mt.connect();
    if (!connected) {
        console.log('❌ Failed to connect to ' + process.env.MIKROTIK_HOST);
        return;
    }
    const menu = mt.client.menu('/ppp secret');
    const results = await menu.where('name', 'joshua').get();
    const existing = results[0];
    
    if (existing) {
        console.log('🔍 Found secret:', JSON.stringify(existing));
        console.log('📡 Testing update for [joshua]...');
        
        const updateData = {
          profile: '10MBPS' // Try updating to 10MBPS
        };

        try {
            // Variation 1: .where('name', name).set(data)
            console.log('🚀 Attempt 1: menu.where("name", "joshua").set(...)');
            await menu.where('name', 'joshua').set(updateData);
            console.log('✅ Attempt 1 Success!');
        } catch (e1) {
            console.log('❌ Attempt 1 Failed:', e1.message);
            try {
                // Variation 2: .set({ .id: id, ... })
                console.log('🚀 Attempt 2: menu.set({ ".id": id, ... })');
                await menu.set({ ".id": existing['.id'], ...updateData });
                console.log('✅ Attempt 2 Success!');
            } catch (e2) {
                console.log('❌ Attempt 2 Failed:', e2.message);
                try {
                    // Variation 3: raw client.write(...)
                    console.log('🚀 Attempt 3: raw client.write(...)');
                    await mt.client.write(['/ppp/secret/set', '=.id=' + existing['.id'], '=profile=10MBPS']);
                    console.log('✅ Attempt 3 Success!');
                } catch (e3) {
                    console.log('❌ Attempt 3 Failed:', e3.message);
                }
            }
        }
    } else {
        console.log('⚠️ Secret joshua not found on router.');
    }
    mt.client.close();
}

test();
