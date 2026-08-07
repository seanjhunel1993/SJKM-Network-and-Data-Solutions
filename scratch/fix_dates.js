const db = require('../database');

function standardizeDate(dateStr) {
    if (!dateStr || dateStr === "" || dateStr === "N/A" || dateStr === "Suspended") return null;
    
    let d;
    if (dateStr.includes('/')) {
        const parts = dateStr.split('/');
        if (parts.length === 3) {
            const [m, dPart, y] = parts;
            d = new Date(`${y}-${m.padStart(2, '0')}-${dPart.padStart(2, '0')}T12:00:00`);
        }
    } else if (dateStr.includes('-')) {
        d = new Date(dateStr.includes('T') ? dateStr : dateStr + 'T12:00:00');
    } else {
        d = new Date(dateStr);
    }

    if (!d || isNaN(d.getTime())) return dateStr; // Fallback to original if invalid

    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

const clients = db.prepare('SELECT id, next_due_date, installation_date FROM clients').all();
const updateStmt = db.prepare('UPDATE clients SET next_due_date = ?, installation_date = ? WHERE id = ?');

let count = 0;
for (const c of clients) {
    const newDue = standardizeDate(c.next_due_date);
    const newInst = standardizeDate(c.installation_date);
    if (newDue !== c.next_due_date || newInst !== c.installation_date) {
        updateStmt.run(newDue, newInst, c.id);
        count++;
    }
}

console.log(`Successfully standardized dates for ${count} clients.`);
