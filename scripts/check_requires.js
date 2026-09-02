const fs = require('fs');
const path = require('path');
const OPTIONAL_MODULES = new Set([
  '@elevenlabs/elevenlabs-js',
  'msedge-tts'
]);
(async ()=>{
  const scanDirs = ['commands', 'lib'].map(dir => path.join(__dirname, '..', dir));
  const missing = new Map();
  for (const scanDir of scanDirs) {
  const files = fs.readdirSync(scanDir).filter(f=>f.endsWith('.js'));
  for (const file of files) {
    const full = path.join(scanDir, file);
    const label = `${path.basename(scanDir)}/${file}`;
    const src = fs.readFileSync(full,'utf8');
    const requires = Array.from(src.matchAll(/require\(['"]([^'"]+)['"]\)/g)).map(m=>m[1]);
    for (const r of requires) {
      if (r.startsWith('.') || r.startsWith('/')) continue;
      if (OPTIONAL_MODULES.has(r)) continue;
      try { require.resolve(r); }
      catch (e) { 
        if (!missing.has(r)) missing.set(r, []);
        missing.get(r).push(label);
      }
    }
  }
  }
  if (missing.size===0) console.log('No missing external requires detected');
  else {
    console.log('Missing modules:');
    for (const [mod,files] of missing.entries()) {
      console.log('-', mod, 'used in', files.join(', '));
    }
  }
})();
