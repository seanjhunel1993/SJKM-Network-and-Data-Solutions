const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, '..', 'data', 'isp_db.sqlite'));
const settings = db.prepare('SELECT company_name FROM settings LIMIT 1').get();
console.log(JSON.stringify(settings, null, 2));
db.close();
