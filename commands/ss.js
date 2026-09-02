const fetch = require('node-fetch');

async function handleSsCommand(sock, chatId, message, match) {
  if (!match) {
    await sock.sendMessage(chatId, {
      text: `*OUTIL DE CAPTURE D'ÉCRAN*\n\n*.ss <url>*\n*.ssweb <url>*\n*.screenshot <url>*\n\nPrendre une capture d'écran de n'importe quel site Web\n\nExemple :\n.ss https://google.com\n.ssweb https://google.com\n.screenshot https://google.com`,
      quoted: message
    });
    return;
  }

  try {
    // Show typing indicator
    await sock.presenceSubscribe(chatId);
    await sock.sendPresenceUpdate('composing', chatId);

    // Extract URL from command
    const url = match.trim();

    // Validate URL
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return sock.sendMessage(chatId, {
        text: "\u274C Veuillez fournir une URL valide commen\xE7ant par http:// ou https://",
        quoted: message
      });
    }

    // Call the API
    const apiUrl = `https://api.siputzx.my.id/api/tools/ssweb?url=${encodeURIComponent(url)}&theme=light&device=desktop`;
    const response = await fetch(apiUrl, { headers: { 'accept': '*/*' } });

    if (!response.ok) {
      throw new Error(`API responded with status: ${response.status}`);
    }

    // Get the image buffer
    const imageBuffer = await response.buffer();

    // Send the screenshot
    await sock.sendMessage(chatId, {
      image: imageBuffer
    }, {
      quoted: message
    });

  } catch (error) {
    console.error('❌ Error in ss command:', error);
    await sock.sendMessage(chatId, {
      text: "\u274C \xC9chec de la capture d'\xE9cran. Veuillez r\xE9essayer dans quelques minutes. Raisons possibles : \u2022 URL invalide \u2022 Le site Web bloque les captures d'\xE9cran \u2022 Le site Web est en panne \u2022 Le service API est temporairement indisponible",
      quoted: message
    });
  }
}

module.exports = {
  handleSsCommand
};