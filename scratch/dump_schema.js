const db = require('../database');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
tables.forEach(t => {
    const cols = db.prepare('PRAGMA table_info(' + t.name + ')').all();
    console.log('TABLE ' + t.name + ': ' + cols.map(c => c.name).join(', '));
});
