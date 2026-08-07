const db = require('../database');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('Tables:', tables.map(t => t.name));

const broadcastSchema = db.prepare("PRAGMA table_info(broadcasts)").all();
console.log('Broadcasts Schema:', broadcastSchema);

// Check if activity_log exists
const hasLog = tables.some(t => t.name === 'activity_log');
if (!hasLog) {
    console.log('Creating activity_log table...');
    db.prepare(`
        CREATE TABLE IF NOT EXISTS activity_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            category TEXT NOT NULL, -- 'Billing', 'Reminder', 'System', 'Security'
            action TEXT NOT NULL,   -- 'Payment Recorded', 'Payment Voided', 'Email Sent', etc.
            details TEXT,           -- JSON or text details
            admin_name TEXT,
            client_id INTEGER,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `).run();
    console.log('activity_log table created.');
}

process.exit(0);
