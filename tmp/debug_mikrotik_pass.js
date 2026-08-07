const mikrotik = require('../mikrotik');
(async () => {
  await mikrotik.connect();
  const secrets = await mikrotik.getPPPoESecrets();
  console.log('--- MIKROTIK PASSWORDS RAW ---');
  secrets.slice(0, 10).forEach(s => {
    console.log(`User: ${s.name} | Pass: ${s.password} | Type: ${typeof s.password}`);
  });
  process.exit();
})();
