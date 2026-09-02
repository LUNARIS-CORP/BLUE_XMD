const fetch = require('node-fetch');

async function dareCommand(sock, chatId, message) {
  try {
    const shizokeys = 'shizo';
    const res = await fetch(`https://shizoapi.onrender.com/api/texts/dare?apikey=${shizokeys}`);

    if (!res.ok) {
      throw await res.text();
    }

    const json = await res.json();
    const dareMessage = json.result;

    // Send the dare message
    await sock.sendMessage(chatId, { text: dareMessage }, { quoted: message });
  } catch (error) {
    console.error('Error in dare command:', error);
    await sock.sendMessage(chatId, { text: "\u274C Je n'ai pas r\xE9ussi \xE0 oser. Veuillez r\xE9essayer plus tard\xA0!" }, { quoted: message });
  }
}

module.exports = { dareCommand };