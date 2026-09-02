(async ()=>{
  try {
    const { loadCommands } = require('../lib/loader');
    const cmds = await loadCommands();
    console.log('Total entries:', cmds.size);
    if (cmds.stats) {
      console.log('Stats:', JSON.stringify({
        primaryCount: cmds.stats.primaryCount,
        aliasCount: cmds.stats.aliasCount,
        skippedCount: cmds.stats.skippedCount,
        failedCount: cmds.stats.failedCount,
        duplicateCount: cmds.stats.duplicateCount
      }, null, 2));
    }
    const seen = new Set();
    for (const [k,v] of cmds.entries()) {
      if (k === 'stats') continue;
      if (seen.has(v)) continue;
      seen.add(v);
      const name = v && v.name ? v.name : (typeof v);
      const hasExec = v && typeof v.execute === 'function';
      const file = v && v.__file ? v.__file : 'unknown';
      console.log('->', name, '| aliases:', v.aliases ? v.aliases.join(',') : '-', '| execute:', hasExec, '| file:', file);
    }
    if (cmds.stats?.duplicates?.length) {
      console.log('\nDuplicate names/aliases:');
      for (const item of cmds.stats.duplicates) {
        console.log('-', item.name, '|', item.previousFile, '->', item.file);
      }
    }
    if (cmds.stats?.skipped?.length) {
      console.log('\nLegacy / skipped files:');
      for (const item of cmds.stats.skipped) {
        console.log('-', item.file, '|', item.reason);
      }
    }
    if (cmds.stats?.failed?.length) {
      console.log('\nFailed files:');
      for (const item of cmds.stats.failed) {
        console.log('-', item.file, '|', item.error);
      }
    }
    process.exit(0);
  } catch (e) { console.error(e.stack||e); process.exit(1); }
})();
