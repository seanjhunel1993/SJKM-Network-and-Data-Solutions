const mikrotik = require('./mikrotik');

async function fixWinbox() {
    try {
        // Manually ensure env matches what we need for this emergency
        mikrotik.host = '192.168.2.78';
        mikrotik.pass = 'user1234'; 

        console.log(`📡 Attempting to connect to MikroTik [${mikrotik.host}] to restore accounts...`);
        const connected = await mikrotik.connect();
        if (!connected) {
            console.error('❌ Could not connect to MikroTik. Please check START_SERVER.bat is running.');
            return;
        }

        console.log('🔍 Fetching all secrets...');
        const secrets = await mikrotik.getPPPoESecrets();
        const disabledCount = secrets.filter(s => s.disabled).length;
        
        console.log(`📡 Found ${disabledCount} disabled accounts. Reactivating all...`);
        
        for (const s of secrets) {
            if (s.disabled) {
                try {
                    await mikrotik.enablePPPoESecret(s.name);
                    console.log(`✅ Re-enabled: ${s.name}`);
                } catch (err) {
                    console.error(`❌ Failed to enable ${s.name}:`, err.message);
                }
            }
        }
        
        console.log('🎉 RESTORATION COMPLETE. All clients should be back online.');
        process.exit(0);
    } catch (err) {
        console.error('💥 CRITICAL ERROR:', err.message);
        process.exit(1);
    }
}

fixWinbox();
