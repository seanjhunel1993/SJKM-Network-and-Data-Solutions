const Database = require('better-sqlite3');
const db = new Database('data/isp_db.sqlite');
const zones = db.prepare('SELECT * FROM coverage_zones').all();
console.log(JSON.stringify(zones, null, 2));
