const db = require('../database');
const info = db.prepare('PRAGMA table_info(clients)').all();
console.log(info);
process.exit(0);
