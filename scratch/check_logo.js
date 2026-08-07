const db = require('../database.js');
const cols = db.prepare("PRAGMA table_info(settings)").all();
console.log('SETTINGS COLUMNS:');
cols.forEach(c => console.log(' -', c.name));
const s = db.prepare('SELECT hero_logo_url, company_name FROM settings LIMIT 1').get();
console.log('hero_logo_url:', JSON.stringify(s.hero_logo_url));
console.log('company_name:', JSON.stringify(s.company_name));
