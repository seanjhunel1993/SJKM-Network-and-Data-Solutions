const db = require('../database');

const today = new Date();
today.setHours(0,0,0,0);
const oneMonthAgo = new Date(today);
oneMonthAgo.setDate(today.getDate() - 30);

console.log(`Today: ${today.toISOString().split('T')[0]}`);
console.log(`30 days ago: ${oneMonthAgo.toISOString().split('T')[0]}\n`);

// All payments
const payments = db.prepare("SELECT * FROM payments WHERE status = 'paid' ORDER BY id DESC").all();
console.log(`=== ALL PAID PAYMENTS (${payments.length} total) ===`);
let monthRevenue = 0;
for (const p of payments) {
  const pDate = new Date(p.paid_date || p.due_date);
  const inMonth = pDate >= oneMonthAgo;
  const amt = parseFloat(p.amount) || 0;
  if (inMonth) monthRevenue += amt;
  console.log(`  #${p.id} | client_id=${p.client_id} | ₱${amt} | paid_date=${p.paid_date} | due_date=${p.due_date} | ${inMonth ? '✅ IN MONTH' : '⏭️ OLD'}`);
}

console.log(`\n=== MONTH REVENUE CALCULATION ===`);
console.log(`monthRevenue (last 30 days) = ₱${monthRevenue}`);

// Expected revenue
const clients = db.prepare("SELECT id, full_name, monthly_rate, status FROM clients").all();
let expectedRevenue = 0;
console.log(`\n=== EXPECTED REVENUE (all non-disabled clients) ===`);
for (const c of clients) {
  const s = (c.status || '').toLowerCase();
  const rate = parseFloat(c.monthly_rate) || 0;
  if (s !== 'disabled' && s !== 'deleted' && s !== 'inactive') {
    expectedRevenue += rate;
    console.log(`  ${c.full_name.padEnd(25)} | monthly_rate=₱${rate} | status=${c.status}`);
  }
}
console.log(`expectedRevenue = ₱${expectedRevenue}`);
console.log(`efficiency = ${expectedRevenue > 0 ? Math.round((monthRevenue / expectedRevenue) * 100) : 0}%`);
console.log(`remaining = ₱${expectedRevenue - monthRevenue}`);

process.exit(0);
