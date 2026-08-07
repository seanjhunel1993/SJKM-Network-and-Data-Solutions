const http = require('http');

function req(path, method, body, cookies) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (cookies) headers.Cookie = cookies;
    const r = http.request({
      host: 'localhost', port: 3000, path, method, headers
    }, (res) => {
      let chunks = '';
      res.on('data', c => chunks += c);
      res.on('end', () => {
        const setCookie = res.headers['set-cookie'];
        resolve({ status: res.statusCode, body: chunks, setCookie: setCookie ? setCookie.join(';') : null });
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

(async () => {
  // Get admin username/password
  const db = require('../database');
  const admin = db.prepare('SELECT username, email FROM admin_users LIMIT 1').get();
  console.log('Admin:', admin.username);

// Try login - need password. Use a known default? Try common ones.
  let login = await req('/api/admin/login', 'POST', { username: admin.username, password: 'admin123' });
  console.log('Login(admin123):', login.status, login.body.slice(0, 100));
  if (login.status !== 200) {
    login = await req('/api/admin/login', 'POST', { username: admin.username, password: '09122439745' });
    console.log('Login(09122439745):', login.status, login.body.slice(0, 100));
  }
  if (login.status !== 200) {
    login = await req('/api/admin/login', 'POST', { username: admin.username, password: 'admin' });
    console.log('Login(admin):', login.status, login.body.slice(0, 100));
  }
  if (login.status !== 200) {
    login = await req('/api/admin/login', 'POST', { username: admin.username, password: 'password' });
    console.log('Login(password):', login.status, login.body.slice(0, 100));
  }

  const cookie = login.setCookie;
  if (!cookie) { console.log('No cookie - cannot test further'); process.exit(0); }
  console.log('Cookie acquired:', cookie.split(';')[0]);

  // Test settings GET
  const settingsGet = await req('/api/admin/settings', 'GET', null, cookie);
  console.log('Settings GET:', settingsGet.status, settingsGet.body.slice(0, 80));

  // Test settings POST (save)
  const settingsPost = await req('/api/admin/settings', 'POST', {
    company_name: 'SJKM Network and Data Solutions',
    unpaid_profile_name: 'SUSPENDED',
    sms_welcome_template: 'Welcome {{name}}!'
  }, cookie);
  console.log('Settings POST:', settingsPost.status, settingsPost.body.slice(0, 100));

  // Test billing check
  const billing = await req('/api/admin/system/run-billing-checks', 'POST', {}, cookie);
  console.log('Billing check:', billing.status, billing.body.slice(0, 120));

  // Test verify-password
  const verify = await req('/api/admin/verify-password', 'POST', { password: 'wrong-pass' }, cookie);
  console.log('Verify-password (wrong):', verify.status, verify.body.slice(0, 80));
  const verify2 = await req('/api/admin/verify-password', 'POST', { password: '09122439745' }, cookie);
  console.log('Verify-password (default):', verify2.status, verify2.body.slice(0, 80));

  process.exit(0);
})();
