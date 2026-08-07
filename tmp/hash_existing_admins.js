const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const ROOT_DIR = process.cwd();
const SQL_DB = path.join(ROOT_DIR, 'data', 'isp_db.sqlite');

if (!fs.existsSync(SQL_DB)) {
    console.error('❌ Database not found at:', SQL_DB);
    process.exit(1);
}

const db = new Database(SQL_DB);

console.log('🚀 Starting Admin Password Migration...');

const admins = db.prepare('SELECT id, username, password FROM admin_users').all();
let updated = 0;

for (const admin of admins) {
    // Check if it's already a bcrypt hash (starts with $2a$ or $2b$)
    if (admin.password && admin.password.startsWith('$2')) {
        console.log(`[SKIP] Admin ${admin.username} already has a hashed password.`);
        continue;
    }

    console.log(`[HASH] Hashing password for admin: ${admin.username}...`);
    const hashed = bcrypt.hashSync(admin.password || 'password123', 10);
    db.prepare('UPDATE admin_users SET password = ? WHERE id = ?').run(hashed, admin.id);
    updated++;
}

console.log(`✅ Migration complete. Updated ${updated} admin(s).`);
db.close();
