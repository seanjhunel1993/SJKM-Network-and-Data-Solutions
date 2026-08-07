const Database = require('better-sqlite3');
const path = require('path');
const SQL_DB = path.join(__dirname, '..', 'data', 'isp_db.sqlite');
const db = new Database(SQL_DB);
try {
    const info = db.prepare("PRAGMA table_info(clients)").all();
    console.log(info.map(c => c.name));
} catch (err) {
    console.error(err);
}
db.close();
