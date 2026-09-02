(async ()=>{
  const { loadCommands } = require('../lib/loader');
  const cmds = await loadCommands();
  const seen = new Set();
  const results = [];
  const mockSock = {
    sendMessage: async (chat, msg, opts) => { return {}; },
    getName: async ()=> 'Tester',
    updateBlockStatus: async ()=>{},
    groupMetadata: async ()=>({}),
    ev: { on: ()=>{} }
  };

  for (const [k, cmd] of cmds.entries()) {
    if (k === 'stats') continue;
    if (seen.has(cmd)) continue;
    seen.add(cmd);
    const name = cmd.name || k;
    const m = { chat: '123@g.us', senderName: 'Tester', key:{ remoteJid:'123@g.us', fromMe:true }, message: { conversation: `.${name}` } };
    try {
      const p = Promise.resolve(cmd.execute(mockSock,m,[]));
      const res = await Promise.race([p, new Promise((_,r)=>setTimeout(()=>r(new Error('timeout')),4000))]);
      results.push({name, ok:true});
      console.log(name,'OK');
    } catch (e) {
      results.push({name, ok:false, error: String(e.message||e)});
      console.log(name,'ERR', e.message);
    }
  }
  // summarize missing-module errors
  const missing = results.filter(r=>/Cannot find module/i.test(r.error || ''));
  if (missing.length) {
    console.log('\nMissing module errors detected:');
    for (const m of missing) console.log('-', m.name, '->', m.error);
  } else {
    console.log('\nNo immediate "Cannot find module" errors found in command executions.');
  }
})();
