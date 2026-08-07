const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.join(__dirname, '..', 'data', 'isp_db.sqlite');
const db = new Database(dbPath);

try {
    const newName = 'SYNTAX SHELL NETWORK AND DATA SOLUTION';
    db.prepare("UPDATE settings SET company_name = ? WHERE id = 1").run(newName);
    console.log(`✅ Success: Company name updated to "${newName}" in database.`);
} catch (err) {
    console.error("❌ Error:", err.message);
    process.exit(1);
}
db.close();
