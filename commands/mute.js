const isAdmin = require('../lib/isAdmin');

async function muteCommand(sock, chatId, senderId, message, durationInMinutes) {


  const { isSenderAdmin, isBotAdmin } = await isAdmin(sock, chatId, senderId);
  if (!isBotAdmin) {
    await sock.sendMessage(chatId, { text: "Veuillez d'abord faire du bot un administrateur." }, { quoted: message });
    return;
  }

  if (!isSenderAdmin) {
    await sock.sendMessage(chatId, { text: "Seuls les administrateurs de groupe peuvent utiliser la commande mute." }, { quoted: message });
    return;
  }

  try {
    // Mute the group
    await sock.groupSettingUpdate(chatId, 'announcement');

    if (durationInMinutes !== undefined && durationInMinutes > 0) {
      const durationInMilliseconds = durationInMinutes * 60 * 1000;
      await sock.sendMessage(chatId, { text: `Le son du groupe est resté silencieux pendant ${durationInMinutes} minutes.` }, { quoted: message });

      // Set timeout to unmute after duration
      setTimeout(async () => {
        try {
          await sock.groupSettingUpdate(chatId, 'not_announcement');
          await sock.sendMessage(chatId, { text: "Le groupe n\u2019a pas \xE9t\xE9 mis en sourdine." });
        } catch (unmuteError) {
          console.error('Error unmuting group:', unmuteError);
        }
      }, durationInMilliseconds);
    } else {
      await sock.sendMessage(chatId, { text: "Le groupe a \xE9t\xE9 mis en sourdine." }, { quoted: message });
    }
  } catch (error) {
    console.error('Error muting/unmuting the group:', error);
    await sock.sendMessage(chatId, { text: "Une erreur s'est produite lors de la d\xE9sactivation/r\xE9activation du groupe. Veuillez r\xE9essayer." }, { quoted: message });
  }
}

module.exports = muteCommand;