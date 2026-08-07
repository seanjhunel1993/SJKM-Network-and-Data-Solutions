const Database = require('better-sqlite3');
const db = new Database('data/isp_db.sqlite');

const clients = db.prepare("SELECT id, full_name, next_due_date FROM clients").all();
console.log('--- ALL CLIENTS ---');
console.log(clients);

const payments = db.prepare("SELECT id, client_id, amount, paid_date, due_date, status, previous_due_date FROM payments").all();
console.log('--- ALL PAYMENTS ---');
console.log(payments);
