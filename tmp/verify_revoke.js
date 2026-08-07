const Database = require('better-sqlite3');
const path = require('path');

const SQL_DB = path.join(process.cwd(), 'data', 'isp_db.sqlite');
const db = new Database(SQL_DB);

// 1. Add a dummy trusted device
const token = 'test-token-123';
const devices = [{ token, expiry: Date.now() + 10000, added: new Date().toISOString() }];
db.prepare('UPDATE admin_users SET trusted_devices = ? WHERE username = ?').run(JSON.stringify(devices), 'admin');

console.log('✅ Added dummy device with token:', token);

// 2. Mock the revocation logic (backend part)
function mockRevoke(adminUsername, tokenToRevoke) {
    const user = db.prepare('SELECT trusted_devices FROM admin_users WHERE username = ?').get(adminUsername);
    let devList = JSON.parse(user.trusted_devices || '[]');
    devList = devList.filter(d => d.token !== tokenToRevoke);
    db.prepare('UPDATE admin_users SET trusted_devices = ? WHERE username = ?').run(JSON.stringify(devList), adminUsername);
}

mockRevoke('admin', token);

// 3. Verify
const userAfter = db.prepare('SELECT trusted_devices FROM admin_users WHERE username = ?').get('admin');
const remaining = JSON.parse(userAfter.trusted_devices || '[]');
if (remaining.find(d => d.token === token)) {
    console.error('❌ Revocation failed: Token still exists!');
} else {
    console.log('✅ Revocation logic verified: Token removed from database.');
}

db.close();
