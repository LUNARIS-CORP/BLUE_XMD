const fetch = require('node-fetch');

async function memeCommand(sock, chatId, message) {
  try {
    const response = await fetch('https://shizoapi.onrender.com/api/memes/cheems?apikey=shizo');

    // Check if response is an image
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('image')) {
      const imageBuffer = await response.buffer();

      const buttons = [
      { buttonId: '.meme', buttonText: { displayText: '🎭 Another Meme' }, type: 1 },
      { buttonId: '.joke', buttonText: { displayText: '😄 Joke' }, type: 1 }];


      await sock.sendMessage(chatId, {
        image: imageBuffer,
        caption: "> Voici votre m\xE8me cheems\xA0! \uD83D\uDC15",
        buttons: buttons,
        headerType: 1
      }, { quoted: message });
    } else {
      throw new Error('Invalid response type from API');
    }
  } catch (error) {
    console.error('Error in meme command:', error);
    await sock.sendMessage(chatId, {
      text: "\u274C \xC9chec de la r\xE9cup\xE9ration du m\xE8me. Veuillez r\xE9essayer plus tard."
    }, { quoted: message });
  }
}

module.exports = memeCommand;