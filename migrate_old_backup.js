/**
 * 🚀 MIGRATE OLD DATA BACKUP → NEW DATABASE
 * Reads backups/OLD_DATA_export.json and imports ALL tables
 * into the current SQLite database (data/isp_db.sqlite).
 * 
 * This restores the old data on top of the new clean schema.
 * A safety backup of the current (clean) DB is made first.
 */
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const BACKUP_JSON = path.join(__dirname, 'backups', 'OLD_DATA_export.json');
const SQL_DB = path.join(__dirname, 'data', 'isp_db.sqlite');

// Safety backup of the current clean DB before migration
const safetyBackup = path.join(__dirname, 'backups', `clean_before_migrate_${Date.now()}.sqlite`);
if (fs.existsSync(SQL_DB)) {
    fs.copyFileSync(SQL_DB, safetyBackup);
    console.log(`🛡️ Safety backup of current DB → ${safetyBackup}`);
}

if (!fs.existsSync(BACKUP_JSON)) {
    console.error('❌ Backup JSON not found:', BACKUP_JSON);
    process.exit(1);
}

const jsonData = JSON.parse(fs.readFileSync(BACKUP_JSON, 'utf8'));
const db = new Database(SQL_DB);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = OFF');

console.log('📥 Importing OLD data into new database...\n');

// All tables we have in the backup
const ALL_TABLES = [
    'admin_users', 'clients', 'payments', 'applications', 'support_tickets',
    'events', 'reminders_log', 'plans', 'broadcasts', 'portal_notices',
    'payment_proofs', 'expenses', 'installations', 'activity_log',
    'coverage_zones', 'bandwidth_usage', 'traffic_history',
    'sms_queue', 'email_queue'
];

// Generic insert that only inserts columns present in the target table schema
function insertTable(table, rows) {
    if (!rows || !Array.isArray(rows) || rows.length === 0) {
        console.log(`  - ${table}: 0 records (skipped)`);
        return 0;
    }

    // Get valid columns from target schema
    const schemaCols = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
    const columns = Object.keys(rows[0]).filter(col => schemaCols.includes(col));
    if (columns.length === 0) {
        console.log(`  - ${table}: WARNING - no matching columns found`);
        return 0;
    }

    const placeholders = columns.map(() => '?').join(',');
    const sql = `INSERT INTO ${table} (${columns.join(',')}) VALUES (${placeholders})`;
    const stmt = db.prepare(sql);

    let inserted = 0;
    const txn = db.transaction((items) => {
        for (const item of items) {
            const values = columns.map(col => {
                let val = item[col];
                if (typeof val === 'object' && val !== null) return JSON.stringify(val);
                if (typeof val === 'boolean') return val ? 1 : 0;
                return val;
            });
            try {
                stmt.run(...values);
                inserted++;
            } catch (e) {
                console.log(`    ⚠️ Skipped row (${e.message})`);
            }
        }
    });
    txn(rows);
    return inserted;
}

// Special: settings must go to id=1 (INSERT OR REPLACE)
function insertSettings() {
    let s = jsonData.settings;
    if (!s) return 0;
    if (Array.isArray(s)) s = s[0];
    if (!s) return 0;

    const schemaCols = db.prepare('PRAGMA table_info(settings)').all().map(c => c.name);
    const cols = Object.keys(s).filter(c => schemaCols.includes(c));
    
    // Ensure id=1
    const finalCols = [...new Set(['id', ...cols])];
    const placeholders = finalCols.map(() => '?').join(',');
    const sql = `INSERT OR REPLACE INTO settings (${finalCols.join(',')}) VALUES (${placeholders})`;
    const values = finalCols.map(c => {
        if (c === 'id') return 1;
        let v = s[c];
        if (typeof v === 'boolean') return v ? 1 : 0;
        return v;
    });
    db.prepare(sql).run(...values);
    console.log('  - settings: 1 record (restored with id=1)');
    return 1;
}

// Insert settings first (so id=1 exists)
insertSettings();

// Insert all data tables
for (const table of ALL_TABLES) {
    if (table === 'settings') continue;
    const rows = jsonData[table] || [];
    const count = insertTable(table, rows);
    console.log(`  - ${table}: ${count} records`);
}

console.log('\n✅ Migration Complete!');

// Verify counts
console.log('\n📊 VERIFICATION (new database):');
const verifyTables = ['admin_users', 'clients', 'payments', 'plans', 'events', 'expenses', 'installations', 'coverage_zones', 'bandwidth_usage', 'settings'];
verifyTables.forEach(t => {
    const c = db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c;
    console.log(`  ${t}: ${c}`);
});

db.close();
console.log('\n🔒 Database closed. Old data successfully migrated into the new system.');
