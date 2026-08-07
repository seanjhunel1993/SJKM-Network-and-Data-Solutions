const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'isp_db.json');

try {
    if (!fs.existsSync(dbPath)) {
        console.error('❌ Database not found at:', dbPath);
        process.exit(1);
    }

    const data = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    
    if (data && data.clients && Array.isArray(data.clients)) {
        let count = 0;
        data.clients.forEach(client => {
            if (client.status === 'disabled') {
                client.status = 'active';
                count++;
            }
        });
        
        fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
        console.log(`✅ SUCCESS: Restored ${count} clients to ACTIVE status in the database.`);
    } else {
        console.error('❌ Malformed database structure.');
    }
} catch (err) {
    console.error('❌ Restoration Failed:', err.message);
}
