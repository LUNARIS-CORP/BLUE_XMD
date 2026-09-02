let sharp = null;
try {
  sharp = require('sharp');
} catch (err) {
  console.warn('sharp indisponible, commande simage désactivée.');
}
const fs = require('fs');
const fsPromises = require('fs/promises');
const fse = require('fs-extra');
const path = require('path');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

const tempDir = './temp';
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

const scheduleFileDeletion = (filePath) => {
  setTimeout(async () => {
    try {
      await fse.remove(filePath);
      console.log(`File deleted: ${filePath}`);
    } catch (error) {
      console.error(`Failed to delete file:`, error);
    }
  }, 10000); // 5 minutes
};

const convertStickerToImage = async (sock, quotedMessage, chatId) => {
  try {
    if (!sharp) {
      await sock.sendMessage(chatId, { text: "La commande simage nécessite sharp, qui n'est pas disponible sur cet environnement." });
      return;
    }

    const stickerMessage = quotedMessage.stickerMessage;
    if (!stickerMessage) {
      await sock.sendMessage(chatId, { text: "R\xE9pondez \xE0 un autocollant avec .simage pour le convertir." });
      return;
    }

    const stickerFilePath = path.join(tempDir, `sticker_${Date.now()}.webp`);
    const outputImagePath = path.join(tempDir, `converted_image_${Date.now()}.png`);

    const stream = await downloadContentFromMessage(stickerMessage, 'sticker');
    let buffer = Buffer.from([]);
    for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

    await fsPromises.writeFile(stickerFilePath, buffer);
    await sharp(stickerFilePath).toFormat('png').toFile(outputImagePath);

    const imageBuffer = await fsPromises.readFile(outputImagePath);
    await sock.sendMessage(chatId, { image: imageBuffer, caption: "Voici l'image convertie\xA0!" });

    scheduleFileDeletion(stickerFilePath);
    scheduleFileDeletion(outputImagePath);
  } catch (error) {
    console.error('Error converting sticker to image:', error);
    await sock.sendMessage(chatId, { text: "Une erreur s'est produite lors de la conversion de l'autocollant." });
  }
};

module.exports = convertStickerToImage;
