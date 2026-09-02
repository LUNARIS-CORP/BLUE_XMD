const fs = require('fs');
const path = require('path');

const tempDirs = ['temp', 'tmp'].map(dir => path.join(process.cwd(), dir));
const maxAgeMs = 3 * 60 * 60 * 1000;
let removed = 0;

for (const dir of tempDirs) {
  if (!fs.existsSync(dir)) continue;

  for (const file of fs.readdirSync(dir)) {
    const filePath = path.join(dir, file);
    const stats = fs.statSync(filePath);

    if (stats.isFile() && Date.now() - stats.mtimeMs > maxAgeMs) {
      fs.unlinkSync(filePath);
      removed += 1;
    }
  }
}

console.log(`Temp cleanup complete: ${removed} file(s) removed.`);
