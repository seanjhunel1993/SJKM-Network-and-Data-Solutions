const db = require('../database.js');
const mikrotik = require('../utils/mikrotik.js');

function sanitizePassword(pass) {
  if (pass === null || pass === undefined) return '';
  return String(pass).trim();
}

async function runTest() {
  try {
    const secrets = await mikrotik.getPPPoESecrets();
    console.log(`Fetched ${secrets.length} secrets from MikroTik.`);

    const existingClients = db.prepare('SELECT pppoe_user FROM clients').all();
    console.log(`Found ${existingClients.length} existing clients in local database.`);
    const existingUsernames = new Set(existingClients.map(c => (c.pppoe_user || '').toLowerCase().trim()));

    let importedCount = 0;

    db.transaction(() => {
      for (const s of secrets) {
        const username = (s.name || '').toLowerCase().trim();
        if (!username) {
          console.log('Skipping empty username');
          continue;
        }
        if (existingUsernames.has(username)) {
          console.log(`Skipping existing username: ${username}`);
          continue;
        }

        let fullName = s.name;
        if (s.comment) {
          const commentParts = s.comment.split('|');
          if (commentParts.length > 0 && commentParts[0].trim()) {
            fullName = commentParts[0].trim();
          }
        }

        const lastClient = db.prepare(
          "SELECT account_id FROM clients WHERE account_id LIKE 'ACC-%' ORDER BY CAST(SUBSTR(account_id, 5) AS INTEGER) DESC LIMIT 1"
        ).get();
        let nextNum = 1001;
        if (lastClient) {
          const parsed = parseInt((lastClient.account_id || '').replace('ACC-', ''));
          if (!isNaN(parsed)) nextNum = parsed + 1;
        }
        let account_id = `ACC-${nextNum}`;
        while (db.prepare('SELECT id FROM clients WHERE account_id = ?').get(account_id)) {
          nextNum++;
          account_id = `ACC-${nextNum}`;
        }

        let next_due_date = null;
        if (s.comment) {
          const dueMatch = s.comment.match(/Due:\s*([A-Za-z]+\s+\d+,\s+\d+)/i) || s.comment.match(/Due:\s*(\d{4}-\d{2}-\d{2})/i);
          if (dueMatch) {
            const parsedDate = new Date(dueMatch[1]);
            if (!isNaN(parsedDate.getTime())) {
              next_due_date = parsedDate.toISOString().split('T')[0];
            }
          }
        }
        if (!next_due_date) {
          const d = new Date();
          d.setDate(d.getDate() + 30);
          next_due_date = d.toISOString().split('T')[0];
        }

        const billing_day = new Date(next_due_date + 'T00:00:00').getDate() || 1;

        const profileLower = (s.profile || '').toLowerCase().trim();
        const planObj = db.prepare('SELECT * FROM plans WHERE LOWER(name) = ? OR LOWER(id) = ? LIMIT 1').get(profileLower, profileLower);
        const planName = planObj ? planObj.name : (s.profile || '20MBPS');
        const monthly_rate = planObj ? planObj.price : 1000;

        const sanitizedPass = s.password ? sanitizePassword(s.password) : '1234';
        const installDate = new Date().toISOString().split('T')[0];
        const status = s.disabled ? 'disabled' : 'active';

        console.log(`Inserting client: ${username} (Account: ${account_id}, Plan: ${planName})`);

        db.prepare(`
          INSERT INTO clients (
            account_id, full_name, address, contact, email, 
            pppoe_user, pppoe_pass, web_password, must_change_password, plan, monthly_rate, 
            vlan_id, olt_port, status, ip_address, mac_address, 
            signal_strength, installation_date, next_due_date, billing_day, service, latitude, longitude
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          account_id, fullName, '', '', '',
          s.name, sanitizedPass, sanitizedPass, 1, planName, monthly_rate,
          100, '1/1/1', status, s.remoteAddress || '', '', '',
          installDate, next_due_date, billing_day, 'pppoe', null, null
        );

        const newClient = db.prepare('SELECT id FROM clients WHERE account_id = ?').get(account_id);
        if (newClient) {
          db.prepare(`
            INSERT INTO installations (client_id, amount_due, amount_paid, status, remarks, paid_date)
            VALUES (?, ?, ?, ?, ?, ?)
          `).run(
            newClient.id, 
            0, 
            0, 
            'Paid', 
            'Imported client from MikroTik secret',
            installDate
          );
        }

        importedCount++;
      }
    })();

    console.log(`Imported ${importedCount} clients successfully!`);
  } catch (err) {
    console.error('Test failed with error:', err);
  }
}

runTest();
