const license = require('../utils/license');
const fs = require('fs');
const path = require('path');

// User's Machine ID from screenshot
const machineId = 'JWNZ132CN7016349N015L';

// Generate a permanent key
const key = license.generateKey(machineId, 'permanent');

console.log('✅ Generated Key:', key);

// Update .env
const envPath = path.join(__dirname, '../.env');
if (fs.existsSync(envPath)) {
    let content = fs.readFileSync(envPath, 'utf8');
    if (content.includes('LICENSE_KEY=')) {
        content = content.replace(/LICENSE_KEY=.*/, `LICENSE_KEY=${key}`);
    } else {
        content += `\nLICENSE_KEY=${key}`;
    }
    fs.writeFileSync(envPath, content);
    console.log('🚀 .env updated with the new key!');
} else {
    console.log('❌ .env not found.');
}
