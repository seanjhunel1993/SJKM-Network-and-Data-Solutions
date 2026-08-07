const fs = require('fs');
const path = require('path');

const filesToUpdate = [
    'utils/emailTemplates.js',
    'utils/email.js',
    'server.js',
    'public/admin/sales.html',
    'public/admin/network-map.html',
    'public/admin/logs.html',
    'public/admin/maintenance.html',
    'public/admin/login.html',
    'public/admin/expenses.html',
    'public/admin/components/sidebar.html',
    'public/admin/admin.js'
];

const root = path.join(__dirname, '..');

filesToUpdate.forEach(relPath => {
    const fullPath = path.join(root, relPath);
    if (!fs.existsSync(fullPath)) {
        console.log(`⚠️ Skipping missing file: ${relPath}`);
        return;
    }

    let content = fs.readFileSync(fullPath, 'utf8');
    
    // Perform replacements
    const originalCount = content.split('FIBR COM').length - 1;
    content = content.replace(/FIBR COM/g, 'SYNTAX SHELL');
    content = content.replace(/Fibr Com/g, 'Syntax Shell');
    
    if (originalCount > 0) {
        fs.writeFileSync(fullPath, content);
        console.log(`✅ Updated ${relPath} (${originalCount} replacements)`);
    }
});

console.log("\n✨ Rebranding Complete: FIBR COM is now SYNTAX SHELL.");
