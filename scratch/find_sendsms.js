const fs = require('fs');
const content = fs.readFileSync('routes/admin.js', 'utf8');
const lines = content.split('\n');
lines.forEach((line, idx) => {
  if (line.includes('sendSMS')) {
    console.log(`Line ${idx+1}: ${line.trim()}`);
  }
});
