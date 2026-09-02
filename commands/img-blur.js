const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const axios = require('axios');
const sharp = require('sharp');

async function blurCommand(sock, chatId, message, quotedMessage) {
  try {
    // Get the image to blur
    let imageBuffer;

    if (quotedMessage) {
      // If replying to a message
      if (!quotedMessage.imageMessage) {
        await sock.sendMessage(chatId, {
          text: "\u274C Veuillez r\xE9pondre \xE0 un message image"
        }, { quoted: message });
        return;
      }

      const quoted = {
        message: {
          imageMessage: quotedMessage.imageMessage
        }
      };

      imageBuffer = await downloadMediaMessage(
        quoted,
        'buffer',
        {},
        {}
      );
    } else if (message.message?.imageMessage) {
      // If image is in current message
      imageBuffer = await downloadMediaMessage(
        message,
        'buffer',
        {},
        {}
      );
    } else {
      await sock.sendMessage(chatId, {
        text: "\u274C Veuillez r\xE9pondre \xE0 une image ou envoyer une image avec la l\xE9gende .blur"
      }, { quoted: message });
      return;
    }

    // Resize and optimize image
    const resizedImage = await sharp(imageBuffer).
    resize(800, 800, { // Resize to max 800x800
      fit: 'inside',
      withoutEnlargement: true
    }).
    jpeg({ quality: 80 }) // Convert to JPEG with 80% quality
    .toBuffer();

    // Apply blur effect directly using sharp
    const blurredImage = await sharp(resizedImage).
    blur(10) // Blur radius of 10
    .toBuffer();

    // Send the blurred image
    await sock.sendMessage(chatId, {
      image: blurredImage,
      caption: "*[ \u2714 ] Image floue avec succ\xE8s*",
      contextInfo: {
        forwardingScore: 1,
        isForwarded: true,
        forwardedNewsletterMessageInfo: {
          newsletterJid: '120363409511028124@newsletter',
          newsletterName: 'LUN∆RIS',
          serverMessageId: -1
        }
      }
    }, { quoted: message });

  } catch (error) {
    console.error('Error in blur command:', error);
    await sock.sendMessage(chatId, {
      text: "\u274C \xC9chec du floutage de l'image. Veuillez r\xE9essayer plus tard."
    }, { quoted: message });
  }
}

module.exports = blurCommand;