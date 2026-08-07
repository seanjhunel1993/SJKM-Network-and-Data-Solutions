const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.join(__dirname, '..', 'data', 'isp_db.sqlite');
const db = new Database(dbPath);

try {
    db.prepare("ALTER TABLE settings ADD COLUMN sms_due_today_template TEXT;").run();
    db.prepare("ALTER TABLE settings ADD COLUMN sms_overdue_template TEXT;").run();
    console.log("✅ Success: Due Today and Overdue SMS template columns added.");
} catch (err) {
    if (err.message.includes('duplicate column name')) {
        console.log("ℹ️ Info: Columns already exist, skipping.");
    } else {
        console.error("❌ Error:", err.message);
        process.exit(1);
    }
}
db.close();
