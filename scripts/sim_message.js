(async ()=>{
  try {
    const { handleMessages } = require('../main');
    const mockSock = {
      sendMessage: async (chat, message, opts) => { console.log('MOCK_SEND', chat, Object.keys(message||{}).slice(0,5)); return {}; },
      getName: async (jid) => 'Tester',
      updateBlockStatus: async () => {},
      groupMetadata: async () => ({}),
      ev: { on: ()=>{} },
    };

    const message = {
      key: { remoteJid: '123456@s.whatsapp.net', fromMe: false, id: 'test-id-1' },
      message: { conversation: '.search test' },
      pushName: 'Tester'
    };

    const update = { messages: [message], type: 'notify' };
    console.log('Calling handleMessages');
    await handleMessages(mockSock, update, true);
    console.log('handleMessages returned');
  } catch (e) {
    console.error('sim_message error', e && e.stack || e);
    process.exit(1);
  }
})();
