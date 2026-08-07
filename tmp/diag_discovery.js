const dgram = require('dgram');
const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

socket.on('error', (err) => {
    console.log('❌ FATAL SOCKET ERROR:', err.message);
    process.exit(1);
});

socket.on('message', (msg, rinfo) => {
    console.log(`📩 Received ${msg.length} bytes from ${rinfo.address}:${rinfo.port}`);
});

console.log('📡 Attempting to bind to UDP 5678...');
try {
    socket.bind(5678, () => {
        console.log('✅ Successfully bound to 5678.');
        socket.setBroadcast(true);
        
        console.log('🚀 Sending probe to 255.255.255.255...');
        const probe = Buffer.from([0, 0, 0, 0]);
        socket.send(probe, 0, probe.length, 5678, '255.255.255.255', (err) => {
            if (err) console.error('❌ Send error:', err.message);
            else console.log('✅ Probe sent.');
        });

        console.log('⏳ Waiting 10s for responses...');
        setTimeout(() => {
            console.log('🏁 Diagnostic complete.');
            socket.close();
        }, 10000);
    });
} catch (e) {
    console.error('❌ Bind catch error:', e.message);
}
