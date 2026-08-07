const { generateKey, getMachineId } = require('./utils/license');
const readline = require('readline');

// CLI for Seller
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const currentId = getMachineId();

console.log('╔══════════════════════════════════════════════════╗');
console.log('║           SJKM LICENSE KEY GENERATOR              ║');
console.log('╚══════════════════════════════════════════════════╝');
console.log(`📡 Your Local Machine ID: ${currentId}`);
console.log('----------------------------------------------------');

const fs = require('fs');
const path = require('path');

rl.question('👤 Enter Client Name: ', (clientName) => {
  if (!clientName || clientName.trim() === '') {
    console.log('❌ Error: Client Name is required.');
    process.exit(1);
  }

  rl.question('🖥️  Enter Client Machine ID: ', (targetId) => {
    if (!targetId || targetId.trim() === '') {
      console.log('❌ Error: Machine ID is required.');
      process.exit(1);
    }

    console.log('\n--- License Types: ---');
    console.log('1. Permanent (Lifetime)');
    console.log('2. Trial (24 Hours)');
    console.log('3. Trial (7 Days)');
    
    rl.question('\n🔑 Choose Type (1, 2, or 3): ', (choice) => {
      let key;
      let typeLabel = '';
      let expiry = null;

      if (choice === '1') {
        key = generateKey(targetId.trim(), 'permanent');
        typeLabel = 'PERMANENT';
        console.log('\n✅ PERMANENT LICENSE GENERATED:');
      } else if (choice === '2' || choice === '3') {
        const days = (choice === '2') ? 1 : 7;
        const expDate = new Date();
        expDate.setDate(expDate.getDate() + days);
        expiry = expDate.toISOString().split('T')[0];
        key = generateKey(targetId.trim(), 'trial', expiry);
        typeLabel = `${days}-DAY TRIAL`;
        console.log(`\n⏳ ${typeLabel} LICENSE GENERATED (Expires: ${expiry}) :`);
      } else {
        console.log('❌ Invalid Choice.');
        process.exit(1);
      }

      console.log('----------------------------------------------------');
      console.log(key);
      console.log('----------------------------------------------------');
      
      // ─── SELLER'S VAULT LOGGING ───
      const vaultPath = path.join(__dirname, 'seller_vault.json');
      let vault = [];
      if (fs.existsSync(vaultPath)) {
        try { vault = JSON.parse(fs.readFileSync(vaultPath, 'utf8')); } catch(e) {}
      }

      vault.push({
        client: clientName.trim(),
        machineId: targetId.trim(),
        key: key,
        type: typeLabel,
        expiry: expiry,
        generatedAt: new Date().toISOString()
      });

      fs.writeFileSync(vaultPath, JSON.stringify(vault, null, 2), 'utf8');
      
      console.log(`📂 Saved to Seller's Vault: ${path.basename(vaultPath)}`);
      console.log('💡 INSTRUCTION: Copy the JKL-X-... code and send it to your client.');
      console.log('');
      process.exit(0);
    });
  });
});
