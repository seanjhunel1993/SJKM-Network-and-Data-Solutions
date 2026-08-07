const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'isp_db.sqlite');
const db = new Database(dbPath);

const cols = db.prepare("PRAGMA table_info(clients)").all().map(c => c.name);
console.log('Current clients columns:', cols.join(', '));

const missing = [
  'next_due_date',
  'monthly_rate',
  'wallet_balance',
  'vlan_id',
  'olt_port',
  'ip_address',
  'mac_address',
  'signal_strength',
  'service',
  'latitude',
  'longitude',
  'remarks',
  'web_password',
  'must_change_password',
  'updated_at',
  'auto_suspend'
];

missing.forEach(col => {
  if (!cols.includes(col)) {
    const typeMap = {
      next_due_date: 'TEXT',
      monthly_rate: 'REAL DEFAULT 0',
      wallet_balance: 'REAL DEFAULT 0',
      vlan_id: 'INTEGER DEFAULT 100',
      olt_port: "TEXT DEFAULT '1/1/1'",
      ip_address: "TEXT DEFAULT ''",
      mac_address: "TEXT DEFAULT ''",
      signal_strength: "TEXT DEFAULT ''",
      service: "TEXT DEFAULT 'pppoe'",
      latitude: 'REAL',
      longitude: 'REAL',
      remarks: 'TEXT',
      web_password: 'TEXT',
      must_change_password: 'INTEGER DEFAULT 1',
      updated_at: 'TEXT',
      auto_suspend: 'INTEGER DEFAULT 1'
    };
    try {
      db.exec(`ALTER TABLE clients ADD COLUMN ${col} ${typeMap[col] || 'TEXT'}`);
      console.log(`✅ Added clients.${col}`);
    } catch(e) {
      console.log(`⚠️ Could not add ${col}: ${e.message}`);
    }
  }
});

// Verify
const updatedCols = db.prepare("PRAGMA table_info(clients)").all().map(c => c.name);
console.log('\nUpdated clients columns:', updatedCols.join(', '));
console.log('\n✅ All client schema fixes applied!');
db.close();
