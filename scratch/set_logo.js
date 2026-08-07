const db = require('../database.js');
// Set the hero_logo_url to point to the branding logo
const logoUrl = '/uploads/branding/logo.png';
db.prepare('UPDATE settings SET hero_logo_url = ?').run(logoUrl);
const s = db.prepare('SELECT hero_logo_url, company_name FROM settings LIMIT 1').get();
console.log('Updated hero_logo_url:', JSON.stringify(s.hero_logo_url));
console.log('company_name:', JSON.stringify(s.company_name));
db.close();
