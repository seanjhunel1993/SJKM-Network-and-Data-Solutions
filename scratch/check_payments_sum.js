const Database = require('better-sqlite3');
const db = new Database('data/isp_db.sqlite');
const result = db.prepare("SELECT COUNT(*) as count, SUM(amount) as total FROM payments WHERE status = 'paid'").get();
console.log(JSON.stringify(result, null, 2));
db.close();
