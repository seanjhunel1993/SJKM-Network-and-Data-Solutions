const db = require('../database');

console.log('--- PLANS ---');
const plans = db.prepare('SELECT * FROM plans').all();
console.log(plans);

console.log('\n--- CLIENTS (Active) ---');
const clients = db.prepare(`
    SELECT id, full_name, email, contact, billing_day, plan
    FROM clients
    WHERE status = 'active'
`).all();
console.log(clients);

process.exit(0);
