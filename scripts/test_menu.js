(async ()=>{
  try {
    const cmd = require('../commands/menu');
    const mockSock = {
      sendMessage: async (chat, message, opts) => {
        console.log('MOCK_SEND ->', chat);
        if (typeof message === 'object' && message.image) {
          console.log('sending image message with caption length', (message.caption||'').length);
        } else if (typeof message === 'object' && (message.text || message.caption)) {
          console.log('sending text message length', (message.text||message.caption||'').length);
        } else {
          console.log('sending message object keys', Object.keys(message || {}));
        }
        return Promise.resolve();
      }
    };
    const m = { chat: '123@g.us', senderName: 'Tester' };
    console.log('Calling menu.execute');
    await cmd.execute(mockSock, m);
    console.log('menu.execute completed');
  } catch (e) {
    console.error('menu test error:', e && e.stack ? e.stack : e);
    process.exit(1);
  }
})();
