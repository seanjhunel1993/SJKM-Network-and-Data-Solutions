const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const ROOT_DIR = path.resolve(__dirname, '..');
const SQL_DB = path.join(ROOT_DIR, 'data', 'isp_db.sqlite');

if (!fs.existsSync(SQL_DB)) {
    console.error(`Database not found at: ${SQL_DB}`);
    process.exit(1);
}

const db = new Database(SQL_DB);

try {
    console.log(`Connected to: ${SQL_DB}`);
    console.log('--- Current Settings Schema ---');
    const columns = db.prepare("PRAGMA table_info(settings)").all();
    columns.forEach(col => console.log(`${col.name} (${col.type})`));

    console.log('\n--- Adding Custom Template Columns ---');
    
    // Add columns if they don't exist
    const columnNames = columns.map(c => c.name);
    
    if (!columnNames.includes('sms_receipt_template')) {
        db.prepare("ALTER TABLE settings ADD COLUMN sms_receipt_template TEXT").run();
        console.log('Added: sms_receipt_template');
    }
    
    if (!columnNames.includes('sms_billing_reminder_template')) {
        db.prepare("ALTER TABLE settings ADD COLUMN sms_billing_reminder_template TEXT").run();
        console.log('Added: sms_billing_reminder_template');
    }

    console.log('Database updated successfully!');
} catch (err) {
    console.error('Error updating database:', err.message);
} finally {
    db.close();
}
