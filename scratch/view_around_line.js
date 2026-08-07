const fs = require('fs');

const logPath = 'C:\\Users\\Administrator\\.gemini\\antigravity\\brain\\fe9e8a66-0243-4262-8c9b-23424aecf2b2\\.system_generated\\logs\\overview.txt';
const content = fs.readFileSync(logPath, 'utf8');

const lines = content.split('\n');
for (let i = 115; i <= 135; i++) {
  if (i < lines.length) {
    console.log(`Line ${i}: length ${lines[i].length}, start: ${lines[i].substring(0, 100)}`);
  }
}
