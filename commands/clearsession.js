const fs = require('fs');
const path = require('path');
const os = require('os');
const isOwnerOrSudo = require('../lib/isOwner');

const channelInfo = {
  contextInfo: {
    forwardingScore: 999,
    isForwarded: true,
    forwardedNewsletterMessageInfo: {
      newsletterJid: '120363409511028124@newsletter',
      newsletterName: 'LUN∆RIS',
      serverMessageId: -1
    }
  }
};

async function clearSessionCommand(sock, chatId, msg) {
  try {
    const senderId = msg.key.participant || msg.key.remoteJid;
    const isOwner = await isOwnerOrSudo(senderId, sock, chatId);

    if (!msg.key.fromMe && !isOwner) {
      await sock.sendMessage(chatId, {
        text: "\u274C Cette commande ne peut \xEAtre utilis\xE9e que par le propri\xE9taire !",
        ...channelInfo
      });
      return;
    }

    // Define session directory
    const sessionDir = path.join(__dirname, '../session');

    if (!fs.existsSync(sessionDir)) {
      await sock.sendMessage(chatId, {
        text: "\u274C R\xE9pertoire de session introuvable !",
        ...channelInfo
      });
      return;
    }

    let filesCleared = 0;
    let errors = 0;
    let errorDetails = [];

    // Send initial status
    await sock.sendMessage(chatId, {
      text: `🔍 Optimisation des fichiers de session pour de meilleures performances...`,
      ...channelInfo
    });

    const files = fs.readdirSync(sessionDir);

    // Count files by type for optimization
    let appStateSyncCount = 0;
    let preKeyCount = 0;

    for (const file of files) {
      if (file.startsWith('app-state-sync-')) appStateSyncCount++;
      if (file.startsWith('pre-key-')) preKeyCount++;
    }

    // Delete files
    for (const file of files) {
      if (file === 'creds.json') {
        // Skip creds.json file
        continue;
      }
      try {
        const filePath = path.join(sessionDir, file);
        fs.unlinkSync(filePath);
        filesCleared++;
      } catch (error) {
        errors++;
        errorDetails.push(`Failed to delete ${file}: ${error.message}`);
      }
    }

    // Send completion message
    const message = `✅ Session files cleared successfully!\n\n` +
    `📊 Statistics:\n` +
    `• Total files cleared: ${filesCleared}\n` +
    `• App state sync files: ${appStateSyncCount}\n` +
    `• Pre-key files: ${preKeyCount}\n` + (
    errors > 0 ? `\n⚠️ Errors encountered: ${errors}\n${errorDetails.join('\n')}` : '');

    await sock.sendMessage(chatId, {
      text: message,
      ...channelInfo
    });

  } catch (error) {
    console.error('Error in clearsession command:', error);
    await sock.sendMessage(chatId, {
      text: "\u274C \xC9chec de l'effacement des fichiers de session\xA0!",
      ...channelInfo
    });
  }
}

module.exports = clearSessionCommand;