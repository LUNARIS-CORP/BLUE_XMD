async function shipCommand(sock, chatId, msg, groupMetadata) {
  try {
    // Get all participants from the group
    const participants = await sock.groupMetadata(chatId);
    const ps = participants.participants.map((v) => v.id);

    // Get two random participants
    let firstUser, secondUser;

    // Select first random user
    firstUser = ps[Math.floor(Math.random() * ps.length)];

    // Select second random user (different from first)
    do {
      secondUser = ps[Math.floor(Math.random() * ps.length)];
    } while (secondUser === firstUser);

    // Format the mentions
    const formatMention = (id) => '@' + id.split('@')[0];

    // Create and send the ship message
    await sock.sendMessage(chatId, {
      text: `${formatMention(firstUser)} ❤️ ${formatMention(secondUser)}\nFélicitations 💖🍻`,
      mentions: [firstUser, secondUser]
    });

  } catch (error) {
    console.error('Error in ship command:', error);
    await sock.sendMessage(chatId, { text: "\u274C \xC9chec de l'exp\xE9dition\xA0! Assurez-vous qu'il s'agit d'un groupe." });
  }
}

module.exports = shipCommand;