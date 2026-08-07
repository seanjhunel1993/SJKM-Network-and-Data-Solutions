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
        console.log('--- SYSTEM INFO ---');
        const identity = await client.menu('/system/identity').getOnly();
        console.log(`Identity: ${identity.name}`);

        console.log('\n--- INTERFACES ---');
        const interfaces = await client.menu('/interface').get();
        interfaces.forEach(i => console.log(`${i.name} (${i.type}): Running=${i.running}, Disabled=${i.disabled}`));

        console.log('\n--- IP ADDRESSES ---');
        const addresses = await client.menu('/ip/address').get();
        addresses.forEach(a => console.log(`${a.address} on ${a.interface}`));

        console.log('\n--- ROUTES ---');
        const routes = await client.menu('/ip/route').get();
        routes.forEach(r => console.log(`[${r.active === 'true' ? 'A' : ' '}${r.static === 'true' ? 's' : ' '}] Dst: ${r['dst-address']}, Gwy: ${r.gateway}, Dist: ${r.distance}, RoutingMark: ${r['routing-mark'] || 'none'}`));

        console.log('\n--- NAT RULES ---');
        const nat = await client.menu('/ip/firewall/nat').get();
        nat.forEach((n, idx) => console.log(`${idx}: Chain=${n.chain}, Action=${n.action}, Out=${n['out-interface'] || 'any'}, src-addr=${n['src-address'] || 'any'}`));

        console.log('\n--- MANGLE RULES ---');
        const mangle = await client.menu('/ip/firewall/mangle').get();
        mangle.forEach((m, idx) => console.log(`${idx}: Chain=${m.chain}, Action=${m.action}, New-Mark=${m['new-routing-mark'] || m['new-connection-mark'] || 'none'}`));

        console.log('\n--- DNS ---');
        const dns = await client.menu('/ip/dns').getOnly();
        console.log(`Servers: ${dns.servers}, AllowRemote: ${dns['allow-remote-requests']}`);

        await api.close();
    } catch (e) {
        console.error('❌ Diagnostic failed:', e.message);
    }
}

deepDiagnose();
