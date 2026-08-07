const dgram = require('dgram');
const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

socket.on('message', (msg, rinfo) => {
    console.log(`📩 Received ${msg.length} bytes from ${rinfo.address}:${rinfo.port}`);
});

socket.bind(5678, () => {
    socket.setBroadcast(true);
    console.log('🚀 Sending probe to 100.168.1.255...');
    const probe = Buffer.from([0, 0, 0, 0]);
    socket.send(probe, 0, probe.length, 5678, '100.168.1.255');
    
    setTimeout(() => {
        console.log('🏁 Done.');
        socket.close();
    }, 5000);
});
