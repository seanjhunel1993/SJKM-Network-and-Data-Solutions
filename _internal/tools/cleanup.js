const db = require('../database');

async function cleanup() {
    console.log('🧹 Starting name cleanup...');
    const clients = db.prepare('SELECT * FROM clients').all();
    let count = 0;
    
    clients.forEach(c => {
        if (c.full_name && c.full_name.includes(' | ')) {
            const oldValue = c.full_name;
            const clean = c.full_name.split(' | ')[0].trim();
            console.log(`✨ Cleaning [${oldValue}] -> [${clean}]`);
            db.prepare('UPDATE clients SET full_name = ? WHERE id = ?').run(clean, c.id);
            count++;
        }
    });

    if (count > 0) {
        await db.save();
        console.log(`✅ Cleanup complete. Fixed ${count} names.`);
    } else {
        console.log('✅ No corrupted names found.');
    }
}

cleanup();
