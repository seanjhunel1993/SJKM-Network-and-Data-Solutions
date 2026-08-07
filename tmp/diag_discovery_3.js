const dgram = require('dgram');
const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

socket.on('message', (msg, rinfo) => {
    console.log(`📩 Received ${msg.length} bytes from ${rinfo.address}:${rinfo.port}`);
    console.log('Hex:', msg.toString('hex'));
});

console.log('📡 Listening on UDP 20561...');
socket.bind(20561, () => {
    socket.setBroadcast(true);
    console.log('🚀 Sending MAC-Telnet Discovery probe to 255.255.255.255...');
    const probe = Buffer.from([0, 0, 0, 0]);
    socket.send(probe, 0, probe.length, 20561, '255.255.255.255');
    
    setTimeout(() => {
        console.log('🏁 Done.');
        socket.close();
    }, 10000);
});
