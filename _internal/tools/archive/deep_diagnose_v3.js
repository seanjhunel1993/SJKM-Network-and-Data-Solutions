require('dotenv').config();
const { RouterOSClient } = require('routeros-client');

async function getRoutes() {
    const api = new RouterOSClient({
        host: process.env.MIKROTIK_HOST,
        user: process.env.MIKROTIK_USER,
        password: process.env.MIKROTIK_PASSWORD,
        port: parseInt(process.env.MIKROTIK_PORT),
        timeout: 10000
    });

    try {
        const client = await api.connect();
        console.log('\n--- ALL ROUTES (RAW) ---');
        const routes = await client.menu('/ip/route').get();
        routes.forEach(r => {
            console.log(JSON.stringify(r));
        });
        await api.close();
    } catch (e) {
        console.error('❌ Diagnostic failed:', e.message);
    }
}

getRoutes();
