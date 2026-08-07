const fs = require('fs');

const logPath = 'C:\\Users\\Administrator\\.gemini\\antigravity\\brain\\fe9e8a66-0243-4262-8c9b-23424aecf2b2\\.system_generated\\logs\\overview.txt';
const content = fs.readFileSync(logPath, 'utf8');

const lines = content.split('\n');

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (line.includes('DOCTYPE') && line.includes('dashboard') && line.length > 1000) {
    console.log(`Found line ${i} of length ${line.length}`);
    fs.writeFileSync(`scratch/extracted_line_${i}.txt`, line);
    
    // Let's try to parse it
    try {
      const obj = JSON.parse(line);
      console.log('Parsed successfully! Keys:', Object.keys(obj));
      if (obj.content) {
        fs.writeFileSync(`scratch/extracted_content_${i}.html`, obj.content);
        console.log('Saved content to extracted_content_' + i + '.html');
      } else if (obj.output) {
        fs.writeFileSync(`scratch/extracted_output_${i}.html`, obj.output);
        console.log('Saved output to extracted_output_' + i + '.html');
      } else {
        // Find if there's any value in the obj that is a long string with DOCTYPE
        for (const k in obj) {
          if (typeof obj[k] === 'string' && obj[k].includes('DOCTYPE')) {
            fs.writeFileSync(`scratch/extracted_${k}_${i}.html`, obj[k]);
            console.log('Saved ' + k + ' to extracted_' + k + '_' + i + '.html');
          } else if (typeof obj[k] === 'object') {
            const str = JSON.stringify(obj[k]);
            if (str.includes('DOCTYPE')) {
              fs.writeFileSync(`scratch/extracted_obj_${k}_${i}.txt`, str);
              console.log('Saved sub-obj ' + k + ' to extracted_obj_' + k + '_' + i + '.txt');
            }
          }
        }
      }
    } catch (err) {
      console.log('Parse error:', err.message);
    }
  }
}
