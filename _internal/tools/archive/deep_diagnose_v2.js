require('dotenv').config();
const { RouterOSClient } = require('routeros-client');

async function deepDiagnose() {
    const api = new RouterOSClient({
        host: process.env.MIKROTIK_HOST,
        user: process.env.MIKROTIK_USER,
        password: process.env.MIKROTIK_PASSWORD,
        port: parseInt(process.env.MIKROTIK_PORT),
        timeout: 10000
    });

    try {
        const client = await api.connect();
        
        console.log('\n--- DETAILED ROUTES ---');
        const routes = await client.menu('/ip/route').get();
        routes.forEach(r => {
            if (r['dst-address'] === '0.0.0.0/0' || r.dstAddress === '0.0.0.0/0') {
                console.log(JSON.stringify(r));
            }
        });

        console.log('\n--- MANGLE RULES (DETAILED) ---');
        const mangle = await client.menu('/ip/firewall/mangle').get();
        mangle.forEach(m => console.log(JSON.stringify(m)));

        console.log('\n--- NAT RULES (DETAILED) ---');
        const nat = await client.menu('/ip/firewall/nat').get();
        nat.forEach(n => {
            if (n.action === 'masquerade') console.log(JSON.stringify(n));
        });

        await api.close();
    } catch (e) {
        console.error('❌ Diagnostic failed:', e.message);
    }
}

deepDiagnose();
