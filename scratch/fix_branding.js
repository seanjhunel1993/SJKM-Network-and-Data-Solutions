const db = require('../database');
const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get();
console.log('Current Settings:', settings);

const newName = 'FIBR COM NETWORK AND DATA SOLUTION';
db.prepare('UPDATE settings SET company_name = ?, sms_sender_name = ? WHERE id = 1').run(newName, newName);
console.log('Updated Settings to:', newName);
process.exit(0);
