const fs = require('fs');
const path = require('path');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const isOwnerOrSudo = require('../lib/isOwner');

async function setProfilePicture(sock, chatId, msg) {
  try {
    const senderId = msg.key.participant || msg.key.remoteJid;
    const isOwner = await isOwnerOrSudo(senderId, sock, chatId);

    if (!msg.key.fromMe && !isOwner) {
      await sock.sendMessage(chatId, {
        text: '❌ Cette commande est réservée au propriétaire !'
      });
      return;
    }

    // Check if message is a reply
    const quotedMessage = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!quotedMessage) {
      await sock.sendMessage(chatId, {
        text: '⚠️ Réponds à une image avec la commande .setpp !'
      });
      return;
    }

    // Check if quoted message contains an image
    const imageMessage = quotedMessage.imageMessage || quotedMessage.stickerMessage;
    if (!imageMessage) {
      await sock.sendMessage(chatId, {
        text: '❌ Le message répondu doit contenir une image !'
      });
      return;
    }

    // Create tmp directory if it doesn't exist
    const tmpDir = path.join(process.cwd(), 'tmp');
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }

    // Download the image
    const stream = await downloadContentFromMessage(imageMessage, 'image');
    let buffer = Buffer.from([]);

    for await (const chunk of stream) {
      buffer = Buffer.concat([buffer, chunk]);
    }

    const imagePath = path.join(tmpDir, `profile_${Date.now()}.jpg`);

    // Save the image
    fs.writeFileSync(imagePath, buffer);

    // Set the profile picture
    await sock.updateProfilePicture(sock.user.id, { url: imagePath });

    // Clean up the temporary file
    fs.unlinkSync(imagePath);

    await sock.sendMessage(chatId, {
      text: '✅ La photo de profil du bot a bien été mise à jour !'
    });

  } catch (error) {
    console.error('Error in setpp command:', error);
    await sock.sendMessage(chatId, {
      text: '❌ Échec de la mise à jour de la photo de profil !'
    });
  }
}

module.exports = setProfilePicture;