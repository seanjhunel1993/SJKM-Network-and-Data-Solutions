const { generateKey, getMachineId } = require('../utils/license');
const { updateEnvValue } = require('../utils/envSync');

try {
    const mid = getMachineId();
    // Set expiry to 1 hour AGO
    const expiredDate = new Date(Date.now() - (60 * 60 * 1000)).toISOString();
    
    const key = generateKey(mid, 'trial', expiredDate);
    
    const success = updateEnvValue('LICENSE_KEY', key);
    
    if (success) {
        console.log('\x1b[33m%s\x1b[0m', '--------------------------------------------------');
        console.log('\x1b[31m%s\x1b[0m', '⚠️  SYSTEM FORCED TO EXPIRED STATE (TEST MODE)');
        console.log('\x1b[33m%s\x1b[0m', '--------------------------------------------------');
        console.log('Expired Key set to .env');
        console.log('Now restart your server (node server.js) and refresh browser.');
    }
} catch (err) {
    console.error('Error forcing expiry:', err.message);
}
