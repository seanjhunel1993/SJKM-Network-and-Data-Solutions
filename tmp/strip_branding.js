const fs = require('fs');
const path = require('path');

const adminDir = path.join(process.cwd(), 'public', 'admin');
const files = fs.readdirSync(adminDir).filter(f => f.endsWith('.html') && f !== 'login.html');

for (const file of files) {
  const filePath = path.join(adminDir, file);
  let content = fs.readFileSync(filePath, 'utf8');

  // 1. Remove from Sidebar
  content = content.replace(/<h2[^>]*>JKL FIBER<\/h2>/g, '<h2 id="sidebarBrandName"></h2>');
  
  // 2. Remove from Mobile Header and add span
  content = content.replace(/<h1>JKL FIBER\s*<small>Monitoring<\/small><\/h1>/g, '<h1><span class="brand-text"></span><small>Monitoring</small></h1>');
  
  // If it's already modified without text, ensure it has the span
  content = content.replace(/<h1>\s*<small>Monitoring<\/small><\/h1>/g, '<h1><span class="brand-text"></span><small>Monitoring</small></h1>');

  fs.writeFileSync(filePath, content);
  console.log(`✅ Updated ${file}`);
}

// Special handling for login.html
const loginPath = path.join(adminDir, 'login.html');
if (fs.existsSync(loginPath)) {
  let loginContent = fs.readFileSync(loginPath, 'utf8');
  loginContent = loginContent.replace(/<h1 id="brandText"[^>]*>JKL FIBER<\/h1>/g, '<h1 id="brandText" style="margin-bottom:0;"></h1>');
  fs.writeFileSync(loginPath, loginContent);
  console.log('✅ Updated login.html');
}
