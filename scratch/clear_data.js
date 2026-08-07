const db = require('../database');

async function clearData() {
  console.log('🧹 Clearing unwanted data...');
  try {
    db.prepare('DELETE FROM applications').run();
    console.log('✅ Applications cleared');
    
    db.prepare('DELETE FROM support_tickets').run();
    console.log('✅ Support Tickets (Tech Review) cleared');
    
    db.prepare('DELETE FROM payment_proofs').run();
    console.log('✅ Payment Proofs (Payment Review) cleared');
    
    db.prepare('DELETE FROM events').run();
    console.log('✅ Event Logs cleared');
    
    console.log('✨ Data cleanup complete.');
  } catch (err) {
    console.error('❌ Data cleanup failed:', err.message);
  }
}

clearData();
