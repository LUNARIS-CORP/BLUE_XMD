async function resetlinkCommand(sock, chatId, senderId) {
  try {
    // Check if sender is admin
    const groupMetadata = await sock.groupMetadata(chatId);
    const isAdmin = groupMetadata.participants.
    filter((p) => p.admin).
    map((p) => p.id).
    includes(senderId);

    // Check if bot is admin
    const botId = sock.user.id.split(':')[0] + '@s.whatsapp.net';
    const isBotAdmin = groupMetadata.participants.
    filter((p) => p.admin).
    map((p) => p.id).
    includes(botId);

    if (!isAdmin) {
      await sock.sendMessage(chatId, { text: "\u274C Seuls les administrateurs peuvent utiliser cette commande !" });
      return;
    }

    if (!isBotAdmin) {
      await sock.sendMessage(chatId, { text: "\u274C Le bot doit \xEAtre administrateur pour r\xE9initialiser le lien du groupe\xA0!" });
      return;
    }

    // Reset the group link
    const newCode = await sock.groupRevokeInvite(chatId);

    // Send the new link
    await sock.sendMessage(chatId, {
      text: `✅ Le lien du groupe a été réinitialisé avec succès\n\n📌 Nouveau lien :\nhttps://chat.whatsapp.com/${newCode}`
    });

  } catch (error) {
    console.error('Error in resetlink command:', error);
    await sock.sendMessage(chatId, { text: "\xC9chec de la r\xE9initialisation du lien du groupe\xA0!" });
  }
}

module.exports = resetlinkCommand;