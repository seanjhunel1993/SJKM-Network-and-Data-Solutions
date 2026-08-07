const fs = require('fs');
const path = require('path');

function updateEnvValue(key, value) {
  const envPath = path.join(process.cwd(), '.env');
  let envContent = '';

  try {
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf8');
    }
  } catch (err) {
    console.error('Error reading .env file:', err);
    return false;
  }

  const lines = envContent.split('\n');
  let keyFound = false;
  const newLines = lines.map(line => {
    const trimmedLine = line.trim();
    if (trimmedLine.startsWith(`${key}=`)) {
      keyFound = true;
      return `${key}=${value}`;
    }
    return line;
  });

  if (!keyFound) {
    newLines.push(`${key}=${value}`);
  }

  try {
    fs.writeFileSync(envPath, newLines.join('\n'), 'utf8');
    process.env[key] = value; // Update in-memory for immediate use
    return true;
  } catch (err) {
    console.error('Error writing .env file:', err);
    return false;
  }
}

module.exports = { updateEnvValue };
