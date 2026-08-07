const net = require('net');

async function scanSubnet() {
    const base = '192.168.2.';
    const ports = [8291, 8728];
    console.log(`🔍 Scanning subnet ${base}0/24 for MikroTik services...`);
    
    const tasks = [];
    for (let i = 1; i <= 254; i++) {
        const host = base + i;
        for (const port of ports) {
            tasks.push((async () => {
                return new Promise((resolve) => {
                    const socket = new net.Socket();
                    socket.setTimeout(300);
                    socket.on('connect', () => {
                        console.log(`✨ FOUND: ${host} has Port ${port} OPEN!`);
                        socket.destroy();
                        resolve(true);
                    });
                    socket.on('timeout', () => { socket.destroy(); resolve(false); });
                    socket.on('error', () => { socket.destroy(); resolve(false); });
                    socket.connect(port, host);
                });
            })());
        }
    }
    await Promise.all(tasks);
    console.log('✅ Subnet scan complete.');
}

scanSubnet();
