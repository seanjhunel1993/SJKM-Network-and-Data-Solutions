const fs = require('fs');
const path = require('path');

const files = [
  'public/admin/sales.html',
  'public/admin/clients.html',
  'public/admin/admin.js',
  'routes/admin.js'
];

files.forEach(f => {
  const filePath = path.join('c:\\Users\\Administrator\\Desktop\\SELL\\5.14.2026\Fibr Com Network and Data Solutions', f);
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    lines.forEach((line, idx) => {
      if (line.toLowerCase().includes('export') || line.toLowerCase().includes('download') || line.toLowerCase().includes('csv')) {
        console.log(`[${f}] Line ${idx+1}: ${line.trim().substring(0, 120)}`);
      }
    });
  } else {
    console.log(`File not found: ${filePath}`);
  }
});
