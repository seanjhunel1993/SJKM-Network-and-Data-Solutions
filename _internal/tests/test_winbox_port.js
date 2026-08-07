const net = require('net');
const client = new net.Socket();
const port = 8291;
const host = '192.168.2.1';

client.setTimeout(2000);
client.connect(port, host, function() {
    console.log('✅ Port ' + port + ' (WinBox) is open on ' + host);
    client.destroy();
    process.exit(0);
});

client.on('error', function(err) {
    console.log('❌ Port ' + port + ' is closed on ' + host + ': ' + err.message);
    process.exit(1);
});

client.on('timeout', function() {
    console.log('⚠️  Port ' + port + ' timed out on ' + host);
    process.exit(1);
});
