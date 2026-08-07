const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.join(__dirname, '..', 'data', 'isp_db.sqlite');
const db = new Database(dbPath);

try {
    db.prepare("ALTER TABLE settings ADD COLUMN sms_app_received_template TEXT;").run();
    db.prepare("ALTER TABLE settings ADD COLUMN sms_app_approved_template TEXT;").run();
    db.prepare("ALTER TABLE settings ADD COLUMN sms_app_rejected_template TEXT;").run();
    db.prepare("ALTER TABLE settings ADD COLUMN sms_welcome_template TEXT;").run();
    console.log("✅ Success: All new SMS template columns added to settings table.");
} catch (err) {
    if (err.message.includes('duplicate column name')) {
        console.log("ℹ️ Info: Columns already exist, skipping.");
    } else {
        console.error("❌ Error:", err.message);
        process.exit(1);
    }
}
db.close();
