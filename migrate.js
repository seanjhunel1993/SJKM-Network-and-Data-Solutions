const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const JSON_DB = path.join(__dirname, 'data', 'isp_db.json');
const SQL_DB = path.join(__dirname, 'data', 'isp_db.sqlite');

async function migrate() {
    console.log('🚀 Starting SQLite Migration...');

    if (!fs.existsSync(JSON_DB)) {
        console.error('❌ JSON database not found. Nothing to migrate.');
        return;
    }

    const jsonData = JSON.parse(fs.readFileSync(JSON_DB, 'utf8'));
    const db = new Database(SQL_DB);

    // Disable synchronous for faster migration
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = OFF');

    console.log('📁 Creating Tables...');

    db.exec(`
        CREATE TABLE IF NOT EXISTS admin_users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password TEXT,
            full_name TEXT,
            email TEXT,
            two_factor_secret TEXT,
            two_factor_enabled INTEGER DEFAULT 0,
            trusted_devices TEXT DEFAULT '[]',
            two_factor_otp TEXT,
            two_factor_otp_expiry INTEGER
        );

        CREATE TABLE IF NOT EXISTS clients (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id TEXT,
            full_name TEXT,
            address TEXT,
            contact TEXT,
            email TEXT,
            pppoe_user TEXT UNIQUE,
            pppoe_pass TEXT,
            plan TEXT,
            monthly_rate REAL,
            vlan_id INTEGER,
            olt_port TEXT,
            status TEXT,
            ip_address TEXT,
            mac_address TEXT,
            signal_strength TEXT,
            installation_date TEXT,
            next_due_date TEXT,
            service TEXT,
            web_password TEXT,
            created_at TEXT,
            updated_at TEXT
        );

        CREATE TABLE IF NOT EXISTS payments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            client_id INTEGER,
            amount REAL,
            paid_date TEXT,
            due_date TEXT,
            payment_method TEXT,
            status TEXT,
            remarks TEXT,
            previous_due_date TEXT,
            created_at TEXT
        );

        CREATE TABLE IF NOT EXISTS applications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            full_name TEXT,
            address TEXT,
            contact TEXT,
            email TEXT,
            desired_plan TEXT,
            message TEXT,
            status TEXT DEFAULT 'pending',
            admin_notes TEXT,
            reviewed_by TEXT,
            scheduled_date TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS support_tickets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            client_id INTEGER,
            account_id TEXT,
            full_name TEXT,
            email TEXT,
            subject TEXT,
            message TEXT,
            priority TEXT,
            status TEXT DEFAULT 'open',
            secure_token TEXT,
            messages TEXT, -- JSON String
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT,
            pppoe_user TEXT,
            caller_id TEXT,
            ip_address TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS reminders_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT,
            target TEXT,
            sent_at TEXT
        );

        CREATE TABLE IF NOT EXISTS settings (
            id INTEGER PRIMARY KEY CHECK (id = 1), -- Only one row allowed
            company_name TEXT,
            support_email TEXT,
            support_phone TEXT,
            admin_alert_email TEXT,
            hero_title TEXT,
            hero_subtitle TEXT,
            hero_logo_url TEXT,
            reminder_1_days INTEGER,
            reminder_2_days INTEGER,
            grace_period INTEGER,
            gcash_number TEXT,
            gcash_name TEXT,
            maya_number TEXT,
            maya_name TEXT,
            facebook_url TEXT,
            gcash_qr_url TEXT,
            maya_qr_url TEXT,
            company_address TEXT,
            sms_api_key TEXT,
            sms_sender_name TEXT,
            sms_enabled INTEGER,
            sms_gateway_url TEXT,
            enable_sms_billing INTEGER,
            enable_sms_apps INTEGER,
            enable_sms_broadcasts INTEGER
        );

        CREATE TABLE IF NOT EXISTS plans (
            id TEXT PRIMARY KEY,
            name TEXT,
            speed TEXT,
            price REAL,
            features TEXT,
            is_popular INTEGER,
            mikrotik_profile TEXT
        );

        CREATE TABLE IF NOT EXISTS broadcasts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT,
            subject TEXT,
            message TEXT,
            target_group TEXT,
            recipients_count INTEGER,
            created_at TEXT
        );

        CREATE TABLE IF NOT EXISTS portal_notices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT,
            content TEXT,
            priority TEXT,
            created_at TEXT
        );

        CREATE TABLE IF NOT EXISTS payment_proofs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            client_id INTEGER,
            full_name TEXT,
            account_id TEXT,
            filename TEXT,
            original_name TEXT,
            amount REAL,
            method TEXT,
            status TEXT DEFAULT 'pending_verification',
            admin_notes TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS bandwidth_usage (
            pppoe_user TEXT PRIMARY KEY,
            monthly_usage REAL DEFAULT 0,
            last_session_rx REAL DEFAULT 0,
            last_session_tx REAL DEFAULT 0,
            month_year TEXT
        );
    `);

    console.log('📥 Importing Data...');

    const insert = (table, data) => {
        if (!Array.isArray(data) || data.length === 0) return;
        
        // Get valid columns from the DB schema
        const schemaCols = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
        
        // Only insert columns that exist in the table schema
        const columns = Object.keys(data[0]).filter(col => schemaCols.includes(col));
        if (columns.length === 0) return;

        const placeholders = columns.map(() => '?').join(',');
        const sql = `INSERT INTO ${table} (${columns.join(',')}) VALUES (${placeholders})`;
        const stmt = db.prepare(sql);
        
        const transaction = db.transaction((items) => {
            for (const item of items) {
                const values = columns.map(col => {
                    let val = item[col];
                    if (typeof val === 'object' && val !== null) {
                        return JSON.stringify(val);
                    }
                    if (typeof val === 'boolean') {
                        return val ? 1 : 0;
                    }
                    return val;
                });
                stmt.run(...values);
            }
        });
        transaction(data);
    };

    // Special handling for settings (mapping from old array format to single row)
    if (jsonData.settings) {
        let s = Array.isArray(jsonData.settings) ? jsonData.settings[0] : jsonData.settings;
        if (s) {
            const cols = Object.keys(s);
            const placeholders = cols.map(() => '?').join(',');
            const sql = `INSERT OR REPLACE INTO settings (id, ${cols.join(',')}) VALUES (1, ${placeholders})`;
            const values = cols.map(c => {
                 let v = s[c];
                 if (typeof v === 'boolean') return v ? 1 : 0;
                 return v;
            });
            db.prepare(sql).run(...values);
        }
    }

    const tables = [
        'admin_users', 'clients', 'payments', 'applications', 
        'support_tickets', 'events', 'reminders_log', 
        'plans', 'broadcasts', 'portal_notices', 'payment_proofs'
    ];

    for (const table of tables) {
        if (jsonData[table]) {
            console.log(`  - Migrating ${table} (${jsonData[table].length} records)...`);
            insert(table, jsonData[table]);
        }
    }

    console.log('✅ Migration Complete!');
    db.close();
}

migrate().catch(err => {
    console.error('❌ Migration Failed:', err);
    process.exit(1);
});
