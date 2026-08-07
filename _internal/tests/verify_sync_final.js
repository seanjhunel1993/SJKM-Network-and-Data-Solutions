require('dotenv').config();
const mt = require('./mikrotik');

async function testFinalSync() {
    console.log('📡 Final Verification starting...');
    const connected = await mt.connect();
    if (!connected) {
        console.log('❌ Failed to connect to MikroTik.');
        return;
    }

    const testUser = 'joshua';
    console.log(`🔍 Testing sync for [${testUser}]...`);

    const updateData = {
        name: 'joshua',
        password: 'newpassword123',
        profile: '20MBPS', // Change from 10MBPS to 20MBPS
        comment: 'VERIFIED SYNC | ' + new Date().toLocaleDateString(),
        service: 'pppoe'
    };

    try {
        console.log('🚀 Executing name-based update...');
        const success = await mt.updatePPPoESecret(testUser, updateData);
        
        if (success) {
            console.log('✅ Update command returned SUCCESS.');
            
            // Re-fetch to verify
            const results = await mt.client.menu('/ppp secret').where('name', 'joshua').get();
            const actual = results[0];
            
            if (actual && actual.profile === '20MBPS' && actual.password === 'newpassword123') {
                console.log('🎉 VERIFICATION PASSED: MikroTik secret matches new system data!');
                console.log('📊 Actual Profile:', actual.profile);
                console.log('📊 Actual Comment:', actual.comment);
            } else {
                console.log('❌ VERIFICATION FAILED: Data on router does not match expected values.');
                console.log('Current state:', JSON.stringify(actual));
            }
        } else {
            console.log('❌ Update command returned FAILURE.');
        }

    } catch (err) {
        console.log('💥 Error during verification:', err.message);
    } finally {
        mt.client.close();
    }
}

testFinalSync();
