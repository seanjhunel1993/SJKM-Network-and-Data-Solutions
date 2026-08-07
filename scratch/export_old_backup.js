// Export the OLD database backup to a portable JSON file
// This reads backups/isp_db_backup_20260807_091541.sqlite (the old data)
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const backupPath = path.join(__dirname, '..', 'backups', 'isp_db_backup_20260807_091541.sqlite');
const outPath = path.join(__dirname, '..', 'backups', 'OLD_DATA_export.json');

if (!fs.existsSync(backupPath)) {
    console.error('❌ Backup file not found:', backupPath);
    process.exit(1);
}

const db = new Database(backupPath, { readonly: true });

const tables = [
    'admin_users', 'clients', 'payments', 'applications', 'support_tickets',
    'events', 'reminders_log', 'settings', 'plans', 'broadcasts',
    'portal_notices', 'payment_proofs', 'expenses', 'installations',
    'activity_log', 'coverage_zones', 'bandwidth_usage', 'traffic_history',
    'sms_queue', 'email_queue'
];

const store = {};
tables.forEach(t => {
    try {
        const rows = db.prepare(`SELECT * FROM ${t}`).all();
        store[t] = rows;
        console.log(`  - ${t}: ${rows.length} records`);
    } catch (e) {
        store[t] = [];
        console.log(`  - ${t}: ERROR (${e.message})`);
    }
});

fs.writeFileSync(outPath, JSON.stringify(store, null, 2), 'utf8');
console.log('\n✅ OLD DATA exported to:', outPath);
console.log('   File size:', (fs.statSync(outPath).size / 1024).toFixed(1) + ' KB');
db.close();
