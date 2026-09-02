const fs = require('fs');
const { channelInfo } = require('../lib/messageConfig');
const isAdmin = require('../lib/isAdmin');
const { isSudo } = require('../lib/index');

async function banCommand(sock, chatId, message) {
  // Restrict in groups to admins; in private to owner/sudo
  const isGroup = chatId.endsWith('@g.us');
  if (isGroup) {
    const senderId = message.key.participant || message.key.remoteJid;
    const { isSenderAdmin, isBotAdmin } = await isAdmin(sock, chatId, senderId);
    if (!isBotAdmin) {
      await sock.sendMessage(chatId, { text: "Veuillez faire du bot un administrateur pour utiliser .ban", ...channelInfo }, { quoted: message });
      return;
    }
    if (!isSenderAdmin && !message.key.fromMe) {
      await sock.sendMessage(chatId, { text: "Seuls les administrateurs de groupe peuvent utiliser .ban", ...channelInfo }, { quoted: message });
      return;
    }
  } else {
    const senderId = message.key.participant || message.key.remoteJid;
    const senderIsSudo = await isSudo(senderId);
    if (!message.key.fromMe && !senderIsSudo) {
      await sock.sendMessage(chatId, { text: "Seul le propri\xE9taire/sudo peut utiliser .ban dans un chat priv\xE9", ...channelInfo }, { quoted: message });
      return;
    }
  }
  let userToBan;

  // Check for mentioned users
  if (message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
    userToBan = message.message.extendedTextMessage.contextInfo.mentionedJid[0];
  }
  // Check for replied message
  else if (message.message?.extendedTextMessage?.contextInfo?.participant) {
    userToBan = message.message.extendedTextMessage.contextInfo.participant;
  }

  if (!userToBan) {
    await sock.sendMessage(chatId, {
      text: "Veuillez mentionner l'utilisateur ou r\xE9pondre \xE0 son message pour le bannir\xA0!",
      ...channelInfo
    });
    return;
  }

  // Prevent banning the bot itself
  try {
    const botId = sock.user.id.split(':')[0] + '@s.whatsapp.net';
    if (userToBan === botId || userToBan === botId.replace('@s.whatsapp.net', '@lid')) {
      await sock.sendMessage(chatId, { text: "Vous ne pouvez pas bannir le compte du bot.", ...channelInfo }, { quoted: message });
      return;
    }
  } catch {}

  try {
    // Add user to banned list
    const bannedUsers = JSON.parse(fs.readFileSync('./data/banned.json'));
    if (!bannedUsers.includes(userToBan)) {
      bannedUsers.push(userToBan);
      fs.writeFileSync('./data/banned.json', JSON.stringify(bannedUsers, null, 2));

      await sock.sendMessage(chatId, {
        text: `Banni avec succès @${userToBan.split('@')[0]} !`,
        mentions: [userToBan],
        ...channelInfo
      });
    } else {
      await sock.sendMessage(chatId, {
        text: `${userToBan.split('@')[0]} est déjà banni !`,
        mentions: [userToBan],
        ...channelInfo
      });
    }
  } catch (error) {
    console.error('Error in ban command:', error);
    await sock.sendMessage(chatId, { text: "\xC9chec du bannissement de l'utilisateur\xA0!", ...channelInfo });
  }
}

module.exports = banCommand;