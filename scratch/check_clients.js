const Database = require('better-sqlite3');
const db = new Database('data/isp_db.sqlite');
const clients = db.prepare('SELECT full_name, status, monthly_rate FROM clients').all();
console.log(JSON.stringify(clients, null, 2));
