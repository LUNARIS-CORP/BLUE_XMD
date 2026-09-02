const fs = require('fs');
const path = require('path');

const sessionDir = path.join(process.cwd(), 'session');

if (!fs.existsSync(sessionDir)) {
  console.log('No session directory found.');
  process.exit(0);
}

fs.rmSync(sessionDir, { recursive: true, force: true });
console.log('Session directory removed. Restart the bot to pair again.');
