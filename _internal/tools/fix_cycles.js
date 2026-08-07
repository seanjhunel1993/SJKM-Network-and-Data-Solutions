const db = require('../database');

/**
 * 📅 HELPER: Parse date strictly from MM/DD/YYYY or YYYY-MM-DD
 */
function parseDateStrict(dateStr) {
  if (!dateStr || dateStr === "" || dateStr === "null" || dateStr === "pppoe") return null;
  
  let d;
  if (dateStr.includes('/')) {
    const [m, dPart, y] = dateStr.split('/');
    d = new Date(`${y}-${m.padStart(2, '0')}-${dPart.padStart(2, '0')}T12:00:00`);
  } else if (dateStr.includes('T')) {
    d = new Date(dateStr);
  } else {
    d = new Date(dateStr + 'T12:00:00');
  }
  
  return isNaN(d.getTime()) ? null : d;
}

async function runFix() {
    console.log('🔄 Starting Database Date Standardization...');
    const clients = db.prepare('SELECT * FROM clients').all();
    let count = 0;
    
    clients.forEach(c => {
        const d = parseDateStrict(c.next_due_date);
        if (d) {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            const iso = `${y}-${m}-${day}`;
            
            if (c.next_due_date !== iso) {
                console.log(`✨ Standardizing [${c.full_name}]: ${c.next_due_date} -> ${iso}`);
                db.prepare('UPDATE clients SET next_due_date = ? WHERE id = ?').run(iso, c.id);
                count++;
            }
        }
    });

    if (count > 0) {
        await db.save();
        console.log(`✅ Fixed ${count} clients.`);
    } else {
        console.log('✅ All dates are already standard.');
    }
}

runFix();
