const net = require('net');
const client = new net.Socket();
const port = 8728;
const host = '192.168.30.2';

client.setTimeout(2000);
client.connect(port, host, function() {
    console.log('✅ Successfully connected to ' + host + ':' + port);
    client.destroy();
    process.exit(0);
});

client.on('error', function(err) {
    console.log('❌ Failed to connect: ' + err.message);
    process.exit(1);
});

client.on('timeout', function() {
    console.log('❌ Connection timed out');
    process.exit(1);
});
