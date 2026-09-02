const axios = require('axios');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { uploadImage } = require('../lib/uploadImage');

async function getQuotedOrOwnImageUrl(sock, message) {
  // 1) Quoted image (highest priority)
  const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  if (quoted?.imageMessage) {
    const stream = await downloadContentFromMessage(quoted.imageMessage, 'image');
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const buffer = Buffer.concat(chunks);
    return await uploadImage(buffer);
  }

  // 2) Image in the current message
  if (message.message?.imageMessage) {
    const stream = await downloadContentFromMessage(message.message.imageMessage, 'image');
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const buffer = Buffer.concat(chunks);
    return await uploadImage(buffer);
  }

  return null;
}

module.exports = {
  name: 'removebg',
  alias: ['rmbg', 'nobg'],
  category: 'general',
  desc: 'Remove background from images',
  async exec(sock, message, args) {
    try {
      const chatId = message.key.remoteJid;
      let imageUrl = null;

      // Check if args contain a URL
      if (args.length > 0) {
        const url = args.join(' ');
        if (isValidUrl(url)) {
          imageUrl = url;
        } else {
          return sock.sendMessage(chatId, {
            text: "\u274C URL fournie non valide. Utilisation\xA0: `.removebg https://example.com/image.jpg`"
          }, { quoted: message });
        }
      } else {
        // Try to get image from message or quoted message
        imageUrl = await getQuotedOrOwnImageUrl(sock, message);

        if (!imageUrl) {
          return sock.sendMessage(chatId, {
            text: "\uD83D\uDCF8 *Supprimer la commande d'arri\xE8re-plan* Utilisation\xA0: \u2022 `.removebg <image_url>` \u2022 R\xE9pondre \xE0 une image avec `.removebg` \u2022 Envoyer l'image avec `.removebg` Exemple\xA0: `.removebg https://example.com/image.jpg`"
          }, { quoted: message });
        }
      }


      // Call the remove background API
      const apiUrl = `https://api.siputzx.my.id/api/iloveimg/removebg?image=${encodeURIComponent(imageUrl)}`;

      const response = await axios.get(apiUrl, {
        responseType: 'arraybuffer',
        timeout: 30000, // 30 second timeout
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      if (response.status === 200 && response.data) {
        // Send the processed image
        await sock.sendMessage(chatId, {
          image: response.data,
          caption: "\u2728 *Arri\xE8re-plan supprim\xE9 avec succ\xE8s !* \uD835\uDDE3\uD835\uDDE5\uD835\uDDE2\uD835\uDDD6\uD835\uDDD8\uD835\uDDE6\uD835\uDDE6\uD835\uDDD8\uD835\uDDD7 \uD835\uDDD5\uD835\uDDEC \uD835\uDDDE\uD835\uDDE1\uD835\uDDDC\uD835\uDDDA\uD835\uDDDB\uD835\uDDE7-\uD835\uDDD5\uD835\uDDE2\uD835\uDDE7"
        }, { quoted: message });
      } else {
        throw new Error('Failed to process image');
      }

    } catch (error) {
      console.error('RemoveBG Error:', error.message);

      let errorMessage = "\u274C \xC9chec de la suppression de l'arri\xE8re-plan.";

      if (error.response?.status === 429) {
        errorMessage = '⏰ Rate limit exceeded. Please try again later.';
      } else if (error.response?.status === 400) {
        errorMessage = '❌ Invalid image URL or format.';
      } else if (error.response?.status === 500) {
        errorMessage = '🔧 Server error. Please try again later.';
      } else if (error.code === 'ECONNABORTED') {
        errorMessage = '⏰ Request timeout. Please try again.';
      } else if (error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED')) {
        errorMessage = '🌐 Network error. Please check your connection.';
      }

      await sock.sendMessage(chatId, {
        text: errorMessage
      }, { quoted: message });
    }
  }
};

// Helper function to validate URL
function isValidUrl(string) {
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;
  }
}