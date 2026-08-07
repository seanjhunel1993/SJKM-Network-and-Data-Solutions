const path = require('path');
const fs = require('fs');

// ─── Environment-Aware Path Logic ───
const isBundled = !!process.pkg;
const ROOT_DIR = isBundled ? path.dirname(process.execPath) : __dirname;

// Stealth Loader for Native Modules (Bypasses PKG Bundling)
const Database = isBundled 
  ? eval('require')(path.join(ROOT_DIR, 'node_modules', 'better-sqlite3'))
  : require('better-sqlite3');

const SQL_DB = path.join(ROOT_DIR, 'data', 'isp_db.sqlite');

// Ensure external data directory exists
const DATA_FOLDER = path.join(ROOT_DIR, 'data');
if (!fs.existsSync(DATA_FOLDER)) {
  fs.mkdirSync(DATA_FOLDER, { recursive: true });
}

// ─── Initialize SQLite ───
const sqlite = new Database(SQL_DB);
sqlite.pragma('journal_mode = WAL'); // High performance mode

// ─── Initialize Schema ───
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS system_info (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    install_date TEXT,
    activation_otp TEXT,
    activation_otp_expiry TEXT
  );

  CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    company_name TEXT,
    support_email TEXT,
    support_phone TEXT,
    admin_alert_email TEXT,
    hero_title TEXT,
    hero_subtitle TEXT,
    hero_logo_url TEXT,
    reminder_1_days INTEGER DEFAULT 3,
    reminder_2_days INTEGER DEFAULT 1,
    grace_period INTEGER DEFAULT 3,
    gcash_number TEXT,
    gcash_name TEXT,
    maya_number TEXT,
    maya_name TEXT,
    facebook_url TEXT,
    gcash_qr_url TEXT,
    maya_qr_url TEXT,
    company_address TEXT,
    email_enabled INTEGER DEFAULT 1, sms_api_key TEXT,
    sms_sender_name TEXT,
    sms_enabled INTEGER DEFAULT 0,
    sms_gateway_url TEXT,
    sms_android_ip TEXT,
    enable_sms_billing INTEGER DEFAULT 1,
    enable_sms_apps INTEGER DEFAULT 1,
    enable_sms_broadcasts INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS plans (
    id TEXT PRIMARY KEY,
    name TEXT,
    speed TEXT,
    price REAL,
    features TEXT,
    is_popular INTEGER DEFAULT 0,
    mikrotik_profile TEXT
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
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
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
    reference_no TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS broadcasts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT,
    subject TEXT,
    message TEXT,
    target_group TEXT,
    recipients_count INTEGER,
    sms_success INTEGER DEFAULT 0,
    sms_failed INTEGER DEFAULT 0,
    email_success INTEGER DEFAULT 0,
    email_failed INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS portal_notices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER,
    type TEXT,
    title TEXT,
    message TEXT,
    priority TEXT DEFAULT 'NORMAL',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
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

  CREATE TABLE IF NOT EXISTS admin_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    full_name TEXT,
    email TEXT,
    role TEXT DEFAULT 'admin',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id TEXT UNIQUE,
    full_name TEXT,
    address TEXT,
    contact TEXT,
    email TEXT,
    pppoe_user TEXT UNIQUE,
    pppoe_pass TEXT,
    plan TEXT,
    status TEXT DEFAULT 'active',
    latitude REAL,
    longitude REAL,
    monthly_rate REAL,
    vlan_id INTEGER,
    olt_port TEXT,
    ip_address TEXT,
    mac_address TEXT,
    signal_strength TEXT,
    installation_date TEXT,
    next_due_date TEXT,
    service TEXT,
    billing_day INTEGER DEFAULT 1,
    auto_suspend INTEGER DEFAULT 1,
    web_password TEXT,
    must_change_password INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT,
    pppoe_user TEXT,
    caller_id TEXT,
    ip_address TEXT,
    timestamp TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS support_tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER,
    account_id TEXT,
    full_name TEXT,
    email TEXT,
    contact_number TEXT,
    ticket_no TEXT UNIQUE,
    secure_token TEXT,
    subject TEXT,
    message TEXT,
    category TEXT,
    status TEXT DEFAULT 'open',
    priority TEXT DEFAULT 'normal',
    messages TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS reminders_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT,
    target TEXT,
    sent_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS coverage_zones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT DEFAULT 'Service Area',
    type TEXT DEFAULT 'polygon',
    coordinates TEXT,
    center_lat REAL,
    center_lng REAL,
    radius REAL,
    color TEXT DEFAULT '#6366f1',
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT,
    description TEXT,
    amount REAL,
    date TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS installations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER,
    amount_due REAL DEFAULT 0,
    amount_paid REAL DEFAULT 0,
    status TEXT DEFAULT 'pending',
    remarks TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL,
    action TEXT NOT NULL,
    details TEXT,
    admin_name TEXT,
    client_id INTEGER,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

  // ─── Migration: Add required columns to expenses ───
try { sqlite.exec("ALTER TABLE expenses ADD COLUMN vendor TEXT"); } catch(e) {}
try { sqlite.exec("ALTER TABLE expenses ADD COLUMN payment_method TEXT DEFAULT 'Cash'"); } catch(e) {}
try { sqlite.exec("ALTER TABLE expenses ADD COLUMN status TEXT DEFAULT 'Paid'"); } catch(e) {}

// 1. Ensure required columns exist
  try { sqlite.exec("ALTER TABLE clients ADD COLUMN web_password TEXT"); } catch(e) {}
  try { sqlite.exec("ALTER TABLE clients ADD COLUMN must_change_password INTEGER DEFAULT 1"); } catch(e) {}
  try { sqlite.exec("ALTER TABLE clients ADD COLUMN updated_at TEXT"); } catch(e) {}
try { sqlite.exec("ALTER TABLE clients ADD COLUMN remarks TEXT"); } catch(e) {}
  try { sqlite.exec("ALTER TABLE clients ADD COLUMN monthly_rate REAL"); } catch(e) {}
  try { sqlite.exec("ALTER TABLE clients ADD COLUMN vlan_id INTEGER"); } catch(e) {}
  try { sqlite.exec("ALTER TABLE clients ADD COLUMN olt_port TEXT"); } catch(e) {}
  try { sqlite.exec("ALTER TABLE clients ADD COLUMN ip_address TEXT"); } catch(e) {}
  try { sqlite.exec("ALTER TABLE clients ADD COLUMN mac_address TEXT"); } catch(e) {}
  try { sqlite.exec("ALTER TABLE clients ADD COLUMN signal_strength TEXT"); } catch(e) {}
  try { sqlite.exec("ALTER TABLE clients ADD COLUMN next_due_date TEXT"); } catch(e) {}
  try { sqlite.exec("ALTER TABLE clients ADD COLUMN service TEXT"); } catch(e) {}
  // ─── Migration: wallet_balance (billing engine depends on this column) ───
  try { sqlite.exec("ALTER TABLE clients ADD COLUMN wallet_balance REAL DEFAULT 0"); } catch(e) {}

// ─── Migration: Add 2FA columns for Admins ───
const addAdminColumn = (col, type, def = '') => {
  try {
    sqlite.exec(`ALTER TABLE admin_users ADD COLUMN ${col} ${type} ${def}`);
  } catch(e) { /* Column likely exists */ }
};

addAdminColumn('email', 'TEXT');
addAdminColumn('two_factor_secret', 'TEXT');
addAdminColumn('two_factor_enabled', 'INTEGER', 'DEFAULT 0');
addAdminColumn('trusted_devices', 'TEXT', "DEFAULT '[]'");
addAdminColumn('two_factor_otp', 'TEXT');
addAdminColumn('two_factor_otp_expiry', 'INTEGER');

// ─── Migration: Add Bandwidth Tracking Tables ───
try {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS bandwidth_usage (
      pppoe_user TEXT PRIMARY KEY,
      monthly_usage REAL DEFAULT 0,
      last_session_rx REAL DEFAULT 0,
      last_session_tx REAL DEFAULT 0,
      month_year TEXT,
      hist_accum_rx REAL DEFAULT 0,
      hist_accum_tx REAL DEFAULT 0
    )
  `);
  
  // Migration for existing tables
  try { sqlite.exec("ALTER TABLE bandwidth_usage ADD COLUMN hist_accum_rx REAL DEFAULT 0"); } catch(e){}
  try { sqlite.exec("ALTER TABLE bandwidth_usage ADD COLUMN hist_accum_tx REAL DEFAULT 0"); } catch(e){}
  try { sqlite.exec("ALTER TABLE bandwidth_usage ADD COLUMN last_uptime INTEGER DEFAULT 0"); } catch(e){}
  
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS traffic_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pppoe_user TEXT,
      rx_kbps REAL DEFAULT 0,
      tx_kbps REAL DEFAULT 0,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_traffic_user_ts ON traffic_history (pppoe_user, timestamp)`);
} catch(e) { }

// Schema initialization already handled above

// ─── Migration: Add SMS & Email Queue Tables ───
try {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS sms_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      number TEXT,
      message TEXT,
      recipient_name TEXT,
      status TEXT DEFAULT 'pending',
      retry_count INTEGER DEFAULT 0,
      sent_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      broadcast_id INTEGER,
      last_error TEXT
    )
  `);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS email_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipient TEXT,
      subject TEXT,
      message_text TEXT,
      message_html TEXT,
      status TEXT DEFAULT 'pending',
      retry_count INTEGER DEFAULT 0,
      sent_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      broadcast_id INTEGER,
      last_error TEXT
    )
  `);
  
  // Migration for existing tables
  try { sqlite.exec("ALTER TABLE sms_queue ADD COLUMN recipient_name TEXT"); } catch(e){}
  try { sqlite.exec("ALTER TABLE sms_queue ADD COLUMN sent_at DATETIME"); } catch(e){}
  try { sqlite.exec("ALTER TABLE sms_queue ADD COLUMN broadcast_id INTEGER"); } catch(e){}
  try { sqlite.exec("ALTER TABLE sms_queue ADD COLUMN last_error TEXT"); } catch(e){}

  // Broadcast Stats Migration
  try { sqlite.exec("ALTER TABLE broadcasts ADD COLUMN sms_success INTEGER DEFAULT 0"); } catch(e){}
  try { sqlite.exec("ALTER TABLE broadcasts ADD COLUMN sms_failed INTEGER DEFAULT 0"); } catch(e){}
  try { sqlite.exec("ALTER TABLE broadcasts ADD COLUMN email_success INTEGER DEFAULT 0"); } catch(e){}
  try { sqlite.exec("ALTER TABLE broadcasts ADD COLUMN email_failed INTEGER DEFAULT 0"); } catch(e){}
} catch(e) { }

// ─── Migration: Add contact fields to support_tickets ───
try { sqlite.exec("ALTER TABLE support_tickets ADD COLUMN category TEXT"); } catch(e) {}
try { sqlite.exec("ALTER TABLE support_tickets ADD COLUMN account_id TEXT"); } catch(e) {}
try { sqlite.exec("ALTER TABLE support_tickets ADD COLUMN full_name TEXT"); } catch(e) {}
try { sqlite.exec("ALTER TABLE support_tickets ADD COLUMN email TEXT"); } catch(e) {}
try { sqlite.exec("ALTER TABLE support_tickets ADD COLUMN contact_number TEXT"); } catch(e) {}
try { sqlite.exec("ALTER TABLE support_tickets ADD COLUMN ticket_no TEXT"); } catch(e) {}
try { sqlite.exec("ALTER TABLE support_tickets ADD COLUMN secure_token TEXT"); } catch(e) {}
try { sqlite.exec("ALTER TABLE support_tickets ADD COLUMN message TEXT"); } catch(e) {}

try { sqlite.exec("ALTER TABLE settings ADD COLUMN email_enabled INTEGER DEFAULT 1"); } catch(e) {}
// ─── Migration: Add wallet_balance to clients (used by billing & payment engine) ───
try { sqlite.exec("ALTER TABLE clients ADD COLUMN wallet_balance REAL DEFAULT 0"); } catch(e) {}
// ─── Migration: Add unpaid_profile_name to settings (auto-suspension) ───
try { sqlite.exec("ALTER TABLE settings ADD COLUMN unpaid_profile_name TEXT DEFAULT 'SUSPENDED'"); } catch(e) {}
// ─── Migration: Add App & Welcome SMS templates to settings ───
try { sqlite.exec("ALTER TABLE settings ADD COLUMN sms_app_received_template TEXT"); } catch(e) {}
try { sqlite.exec("ALTER TABLE settings ADD COLUMN sms_app_approved_template TEXT"); } catch(e) {}
try { sqlite.exec("ALTER TABLE settings ADD COLUMN sms_app_rejected_template TEXT"); } catch(e) {}
try { sqlite.exec("ALTER TABLE settings ADD COLUMN sms_welcome_template TEXT"); } catch(e) {}
try { sqlite.exec("ALTER TABLE settings ADD COLUMN enable_sms_rem1 INTEGER DEFAULT 1"); } catch(e) {}
try { sqlite.exec("ALTER TABLE settings ADD COLUMN enable_sms_rem2 INTEGER DEFAULT 1"); } catch(e) {}
try { sqlite.exec("ALTER TABLE settings ADD COLUMN enable_sms_due_day INTEGER DEFAULT 1"); } catch(e) {}
try { sqlite.exec("ALTER TABLE settings ADD COLUMN enable_sms_grace INTEGER DEFAULT 1"); } catch(e) {}
try { sqlite.exec("ALTER TABLE settings ADD COLUMN enable_sms_receipts INTEGER DEFAULT 1"); } catch(e) {}
try { sqlite.exec("ALTER TABLE settings ADD COLUMN enable_sms_alerts INTEGER DEFAULT 1"); } catch(e) {}
try { sqlite.exec("ALTER TABLE settings ADD COLUMN disable_mikrotik INTEGER DEFAULT 0"); } catch(e) {}
// ─── Migration: Add sms_gateway_type (was missing from original schema) ───
try { sqlite.exec("ALTER TABLE settings ADD COLUMN sms_gateway_type TEXT DEFAULT 'android'"); } catch(e) {}
// ─── Migration: Add SMS Template columns (used by settings POST & broadcast) ───
try { sqlite.exec("ALTER TABLE settings ADD COLUMN sms_receipt_template TEXT"); } catch(e) {}
try { sqlite.exec("ALTER TABLE settings ADD COLUMN sms_billing_reminder_template TEXT"); } catch(e) {}
try { sqlite.exec("ALTER TABLE settings ADD COLUMN sms_due_today_template TEXT"); } catch(e) {}
try { sqlite.exec("ALTER TABLE settings ADD COLUMN sms_overdue_template TEXT"); } catch(e) {}

// ─── Migration: Add Invoice Settings columns ───
try { sqlite.exec("ALTER TABLE settings ADD COLUMN invoice_auto INTEGER DEFAULT 0"); } catch(e) {}
try { sqlite.exec("ALTER TABLE settings ADD COLUMN invoice_days_before INTEGER DEFAULT 3"); } catch(e) {}
try { sqlite.exec("ALTER TABLE settings ADD COLUMN invoice_due_mode TEXT DEFAULT 'fixed'"); } catch(e) {}
try { sqlite.exec("ALTER TABLE settings ADD COLUMN invoice_due_day INTEGER DEFAULT 5"); } catch(e) {}
try { sqlite.exec("ALTER TABLE settings ADD COLUMN invoice_eom_due_day INTEGER DEFAULT 5"); } catch(e) {}
try { sqlite.exec("ALTER TABLE settings ADD COLUMN invoice_billing_period TEXT DEFAULT 'monthly'"); } catch(e) {}
try { sqlite.exec("ALTER TABLE settings ADD COLUMN invoice_footer TEXT"); } catch(e) {}

// ─── Migration: Add Landing Page Settings columns ───
try { sqlite.exec("ALTER TABLE settings ADD COLUMN landing_theme TEXT DEFAULT 'default'"); } catch(e) {}
try { sqlite.exec("ALTER TABLE settings ADD COLUMN landing_tagline TEXT"); } catch(e) {}
try { sqlite.exec("ALTER TABLE settings ADD COLUMN landing_hero_text TEXT"); } catch(e) {}
try { sqlite.exec("ALTER TABLE settings ADD COLUMN landing_about_header TEXT"); } catch(e) {}
try { sqlite.exec("ALTER TABLE settings ADD COLUMN landing_about_text TEXT"); } catch(e) {}
try { sqlite.exec("ALTER TABLE settings ADD COLUMN landing_about_bullets TEXT"); } catch(e) {}
try { sqlite.exec("ALTER TABLE settings ADD COLUMN landing_facebook TEXT"); } catch(e) {}
try { sqlite.exec("ALTER TABLE settings ADD COLUMN landing_youtube TEXT"); } catch(e) {}
try { sqlite.exec("ALTER TABLE settings ADD COLUMN landing_tiktok TEXT"); } catch(e) {}
try { sqlite.exec("ALTER TABLE settings ADD COLUMN speedtest_enabled INTEGER DEFAULT 0"); } catch(e) {}
try { sqlite.exec("ALTER TABLE settings ADD COLUMN speedtest_url TEXT"); } catch(e) {}
try { sqlite.exec("ALTER TABLE settings ADD COLUMN landing_accent TEXT DEFAULT '#2563eb'"); } catch(e) {}
try { sqlite.exec("ALTER TABLE settings ADD COLUMN landing_accent2 TEXT DEFAULT '#7c3aed'"); } catch(e) {}
try { sqlite.exec("ALTER TABLE settings ADD COLUMN landing_hero1 TEXT"); } catch(e) {}
try { sqlite.exec("ALTER TABLE settings ADD COLUMN landing_hero2 TEXT"); } catch(e) {}
try { sqlite.exec("ALTER TABLE settings ADD COLUMN landing_hero3 TEXT"); } catch(e) {}

// ─── Migration: Add Payment Gateway (Xendit) Settings columns ───
try { sqlite.exec("ALTER TABLE settings ADD COLUMN payment_gateway TEXT DEFAULT 'none'"); } catch(e) {}
try { sqlite.exec("ALTER TABLE settings ADD COLUMN xendit_enabled INTEGER DEFAULT 0"); } catch(e) {}
try { sqlite.exec("ALTER TABLE settings ADD COLUMN xendit_secret_key TEXT"); } catch(e) {}
try { sqlite.exec("ALTER TABLE settings ADD COLUMN xendit_webhook_token TEXT"); } catch(e) {}

// ─── Migration: Add MikroTik Router Settings columns ───
try { sqlite.exec("ALTER TABLE settings ADD COLUMN auto_isolate INTEGER DEFAULT 0"); } catch(e) {}
try { sqlite.exec("ALTER TABLE settings ADD COLUMN isolate_days INTEGER DEFAULT 3"); } catch(e) {}
try { sqlite.exec("ALTER TABLE settings ADD COLUMN isolate_action TEXT DEFAULT 'suspend'"); } catch(e) {}
try { sqlite.exec("ALTER TABLE settings ADD COLUMN billing_portal_subnet TEXT DEFAULT '177.177.177.0/24'"); } catch(e) {}
try { sqlite.exec("ALTER TABLE settings ADD COLUMN billing_portal_enabled INTEGER DEFAULT 1"); } catch(e) {}
try { sqlite.exec("ALTER TABLE settings ADD COLUMN billing_portal_walled_garden TEXT"); } catch(e) {}

// ─── Migration: Add Custom Domain settings column ───
try { sqlite.exec("ALTER TABLE settings ADD COLUMN custom_domain TEXT"); } catch(e) {}

// ─── Migration: Add GenieACS settings columns ───
try { sqlite.exec("ALTER TABLE settings ADD COLUMN genieacs_url TEXT"); } catch(e) {}
try { sqlite.exec("ALTER TABLE settings ADD COLUMN genieacs_user TEXT"); } catch(e) {}
try { sqlite.exec("ALTER TABLE settings ADD COLUMN genieacs_pass TEXT"); } catch(e) {}

// ─── Migration: Create Payment Methods (Modes of Payment) table ───
try {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS payment_methods (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT DEFAULT 'ewallet',
      account_name TEXT,
      account_number TEXT,
      qr_url TEXT,
      instructions TEXT,
      is_active INTEGER DEFAULT 1,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
} catch(e) {}

// ─── Migration: Create Roles table ───
try {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      permissions TEXT DEFAULT '[]',
      is_system INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
} catch(e) {}

// ─── Migration: Create Employees table ───
try {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      username TEXT UNIQUE,
      password TEXT,
      email TEXT,
      phone TEXT,
      role_id INTEGER,
      role_name TEXT,
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
} catch(e) {}

// ─── Migration: Create invoices table (for auto-invoice generation) ───
try {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_no TEXT UNIQUE,
      client_id INTEGER,
      account_id TEXT,
      full_name TEXT,
      amount REAL DEFAULT 0,
      due_date TEXT,
      period_start TEXT,
      period_end TEXT,
      status TEXT DEFAULT 'unpaid',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
} catch(e) {}

// ─── Migration: Add reference_no to applications ───
try { 
  sqlite.exec("ALTER TABLE applications ADD COLUMN reference_no TEXT"); 
  sqlite.exec("CREATE INDEX IF NOT EXISTS idx_app_ref ON applications (reference_no)");
} catch(e) {}

// ─── Migration: Add Activation OTP columns ───
try { sqlite.exec("ALTER TABLE system_info ADD COLUMN activation_otp TEXT"); } catch(e) {}
try { sqlite.exec("ALTER TABLE system_info ADD COLUMN activation_otp_expiry TEXT"); } catch(e) {}

// ─── Migration: Add Performance Indexes for Large Datasets ───
try {
  sqlite.exec("CREATE INDEX IF NOT EXISTS idx_clients_account ON clients (account_id)");
  sqlite.exec("CREATE INDEX IF NOT EXISTS idx_payments_client ON payments (client_id)");
  sqlite.exec("CREATE INDEX IF NOT EXISTS idx_payments_date ON payments (paid_date)");
  sqlite.exec("CREATE INDEX IF NOT EXISTS idx_events_user ON events (pppoe_user)");
  sqlite.exec("CREATE INDEX IF NOT EXISTS idx_events_ts ON events (timestamp)");
sqlite.exec("CREATE INDEX IF NOT EXISTS idx_proof_status ON payment_proofs (status)");
  sqlite.exec("CREATE INDEX IF NOT EXISTS idx_proof_client ON payment_proofs (client_id)");
  
  console.log('🚀 [DATABASE] Performance indexes verified.');
} catch(e) { }

/**
 * 🛠️ SQL HELPER: Translates some of our "Mock SQL" peculiarities 
 * to real SQLite if necessary, but most of our app uses standard SQL.
 */
function translateSql(sql) {
    // SQLite doesn't have a date() function that exactly matches our mock usages sometimes,
    // but better-sqlite3 handles standard SQL perfectly.
    return sql;
}

const db = {
  // Existing interface compatibility
  get data() { 
      // SHIM: This is for legacy code that touches db.data.settings[0]
      // We will phase this out, but for now we provide a minimal shim.
      return {
          get settings() {
              return [sqlite.prepare('SELECT * FROM settings WHERE id = 1').get() || {}];
          },
          get clients() {
              return sqlite.prepare('SELECT * FROM clients').all();
          },
          get events() {
              return sqlite.prepare('SELECT * FROM events').all();
          },
          get plans() {
              return sqlite.prepare('SELECT * FROM plans').all();
          },
          get system_info() {
              return sqlite.prepare('SELECT * FROM system_info WHERE id = 1').get() || { install_date: null };
          }
      };
  },

  // Core API
  prepare: (sql) => {
    const stmt = sqlite.prepare(translateSql(sql));
    return {
      get: (...args) => stmt.get(...args),
      all: (...args) => stmt.all(...args),
      run: (...args) => {
          const result = stmt.run(...args);
          return {
              lastInsertRowid: result.lastInsertRowid,
              changes: result.changes
          };
      }
    };
  },

  // Legacy/Compatibility methods
  save: () => { /* Persistent immediately in SQLite */ },
  
  transaction: (fn) => sqlite.transaction(fn),
  exec: (sql) => sqlite.exec(sql),

  // Custom Logic Helpers
  generateToken: (length = 16) => {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let token = '';
    for (let i = 0; i < length; i++) {
      token += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return token;
  },

  identifyUser: (identifier) => {
    const query = String(identifier).toLowerCase().trim();
    if (!query) return null;

    // Search in SQLite
    const client = sqlite.prepare(`
        SELECT * FROM clients 
        WHERE LOWER(contact) LIKE ? 
           OR LOWER(email) LIKE ? 
           OR LOWER(pppoe_user) = ?
    `).get(`%${query}%`, `%${query}%`, query);

    if (client) return { type: 'subscriber', data: client };

    const app = sqlite.prepare(`
        SELECT * FROM applications 
        WHERE LOWER(contact) LIKE ? 
           OR LOWER(email) LIKE ?
    `).get(`%${query}%`, `%${query}%`);

    if (app) return { type: 'applicant', data: app };

    return null;
  },

  getRawStore: () => {
      // SHIM: For backup functionality. Returns a JSON-like object of all tables.
      const tables = ['admin_users', 'clients', 'payments', 'applications', 'support_tickets', 'events', 'reminders_log', 'settings', 'plans', 'broadcasts', 'portal_notices', 'payment_proofs'];
      const store = {};
      tables.forEach(t => {
          store[t] = sqlite.prepare(`SELECT * FROM ${t}`).all();
          // Support tickets messages need to be parsed back to objects for the JSON backup
          if (t === 'support_tickets') {
              store[t].forEach(ticket => {
                  if (ticket.messages) {
                      try { ticket.messages = JSON.parse(ticket.messages); } catch(e) {}
                  }
              });
          }
      });
      return store;
  },

  restoreData: (data) => {
      try {
          sqlite.transaction(() => {
              // Clear current data (Warning: Destructive)
              const tables = ['admin_users', 'clients', 'payments', 'applications', 'support_tickets', 'events', 'reminders_log', 'settings', 'plans', 'broadcasts', 'portal_notices', 'payment_proofs'];
              tables.forEach(t => sqlite.prepare(`DELETE FROM ${t}`).run());

              // Helper to insert
              const insert = (table, items) => {
                  if (!Array.isArray(items) || items.length === 0) return;
                  const cols = Object.keys(items[0]);
                  const stmt = sqlite.prepare(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`);
                  for (const item of items) {
                      const values = cols.map(c => {
                          let v = item[c];
                          if (typeof v === 'object' && v !== null) return JSON.stringify(v);
                          if (typeof v === 'boolean') return v ? 1 : 0;
                          return v;
                      });
                      stmt.run(...values);
                  }
              };

              Object.keys(data).forEach(table => {
                  if (tables.includes(table)) {
                      insert(table, data[table]);
                  }
              });
          })();
          return true;
      } catch (e) {
          console.error('❌ Restore error:', e);
          return false;
      }
  },
  
  maintenance: () => {
    try {
        console.log('🧹 [DATABASE] Starting maintenance & log rotation...');
        sqlite.transaction(() => {
            // 1. Prune Connection/System Events (> 90 days)
            const eventsPruned = sqlite.prepare("DELETE FROM events WHERE timestamp < datetime('now', '-90 days')").run();
            
            // 2. Prune Traffic History (> 30 days) - Very high volume table
            const trafficPruned = sqlite.prepare("DELETE FROM traffic_history WHERE timestamp < datetime('now', '-30 days')").run();
            
            // 3. Prune Old Reminders (> 30 days)
            const remindersPruned = sqlite.prepare("DELETE FROM reminders_log WHERE sent_at < datetime('now', '-30 days')").run();

            // 4. Prune Activity Logs (> 60 days) - Keeps audit trail manageable
            const activityPruned = sqlite.prepare("DELETE FROM activity_log WHERE timestamp < datetime('now', '-60 days')").run();

            console.log(`✅ [MAINTENANCE] Pruned ${eventsPruned.changes} events, ${trafficPruned.changes} traffic points, ${activityPruned.changes} audit logs.`);
        })();
        
        // Optimize Database file
        sqlite.exec("VACUUM");
        console.log('✨ [MAINTENANCE] Database optimized (VACUUM complete).');
        return true;
    } catch (e) {
        console.error('❌ [MAINTENANCE] Error:', e.message);
        return false;
    }
  },
  close: () => {
    try {
        sqlite.close();
        console.log('🔒 [DATABASE] Connection closed successfully.');
    } catch (e) {
        console.error('❌ [DATABASE] Error closing connection:', e.message);
    }
  }
};

module.exports = db;
