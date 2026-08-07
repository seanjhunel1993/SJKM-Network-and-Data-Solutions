const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

const ROOT_DIR = process.cwd();
const SQL_DB = path.join(ROOT_DIR, 'data', 'isp_db.sqlite');
const db = new Database(SQL_DB);

const admin = db.prepare('SELECT password FROM admin_users WHERE username = ?').get('admin');
const testPassword = 'password123';

if (bcrypt.compareSync(testPassword, admin.password)) {
    console.log('✅ LOGIN VERIFIED: Migrated hash works with plain text "password123"');
} else {
    console.error('❌ LOGIN FAILED: Hash mismatch!');
}
db.close();
