const settings = require("../settings");
async function aliveCommand(sock, chatId, message) {
  try {
    const message1 = `*🤖 BLUE est en ligne !*\n\n` +
    `*Version :* ${settings.version}\n` +
    `*Statut :* En ligne\n` +
    `*Mode :* Public\n\n` +
    `*🌟 Fonctionnalités :*\n` +
    `• Gestion des groupes\n` +
    `• Protection anti-lien\n` +
    `• Commandes fun\n` +
    `• Et plus encore !\n\n` +
    `Tape *.menu* pour voir la liste complète des commandes`;

    await sock.sendMessage(chatId, {
      text: message1,
      contextInfo: {
        forwardingScore: 999,
        isForwarded: true,
        forwardedNewsletterMessageInfo: {
          newsletterJid: '120363409511028124@newsletter',
          newsletterName: 'LUNARIS',
          serverMessageId: -1
        }
      }
    }, { quoted: message });
  } catch (error) {
    console.error('Error in alive command:', error);
    await sock.sendMessage(chatId, { text: 'BLUE est en ligne et prêt !' }, { quoted: message });
  }
}

module.exports = aliveCommand;