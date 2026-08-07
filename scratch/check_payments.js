const Database = require('better-sqlite3');
const db = new Database('data/isp_db.sqlite');
const payments = db.prepare("SELECT * FROM payments WHERE status = 'paid'").all();
console.log(JSON.stringify(payments, null, 2));
db.close();
