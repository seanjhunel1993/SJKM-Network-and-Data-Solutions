require('dotenv').config();
const net = require('net');

async function scanPorts() {
    const host = '192.168.2.1';
    const ports = [8728, 8729, 8291, 80, 443, 22, 23];
    console.log(`🔍 Scanning ${host} for open ports...`);
    for (const port of ports) {
        await new Promise((resolve) => {
            const socket = new net.Socket();
            socket.setTimeout(500);
            socket.on('connect', () => {
                console.log(`✅ Port ${port} is OPEN`);
                socket.destroy();
                resolve();
            });
            socket.on('timeout', () => {
                socket.destroy();
                resolve();
            });
            socket.on('error', () => {
                socket.destroy();
                resolve();
            });
            socket.connect(port, host);
        });
    }
    console.log('✅ Port scan complete.');
}

scanPorts();
