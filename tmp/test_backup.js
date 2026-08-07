const { runWeeklyBackup } = require('../utils/scheduler');
const db = require('../database');

async function test() {
    console.log('🧪 Testing Weekly Backup...');
    
    // Ensure there is an email to send to
    const admin = db.prepare('SELECT email FROM admin_users LIMIT 1').get();
    if (!admin || !admin.email) {
        console.log('⚠️ Setting test email for admin...');
        db.prepare("UPDATE admin_users SET email = 'test@example.com' WHERE id = 1").run();
    }

    await runWeeklyBackup();
    
    console.log('---------');
    const lastEvent = db.prepare('SELECT * FROM events WHERE type = ? ORDER BY id DESC LIMIT 1').get('WEEKLY_BACKUP');
    if (lastEvent) {
        console.log('✅ DB Event Log Found:', lastEvent);
    } else {
        console.error('❌ DB Event Log NOT Found!');
    }
}

test();
