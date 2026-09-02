function formatFrenchDate() {
  return new Date().toLocaleString('fr-FR', {
    timeZone: 'Europe/Paris',
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

async function sayCommand(sock, chatId, text, message) {
  const cleanedText = (text || '').trim();

  if (!cleanedText) {
    await sock.sendMessage(chatId, {
      text: '❌ Utilisation : .say <texte>\nExemple : .say Bonjour tout le monde',
    }, { quoted: message });
    return;
  }

  await sock.sendMessage(chatId, {
    text: cleanedText,
  }, { quoted: message });
}

async function timeCommand(sock, chatId, message) {
  const now = formatFrenchDate();

  await sock.sendMessage(chatId, {
    text: `🕒 Heure actuelle :\n${now}`
  }, { quoted: message });
}

async function rulesCommand(sock, chatId, message) {
  const rulesText = `📜 *Règles du groupe / du bot*\n\n1. Respecte tout le monde.\n2. Pas de spam ni de messages répétitifs.\n3. Pas de liens dangereux ou de contenus explicites.\n4. Utilise les commandes avec le bon préfixe .\n5. Ne pas abuser des commandes de modération.\n6. Les admins doivent rester justes et courtois.\n\n✅ Merci de respecter ces règles pour garder un bon environnement.`;

  await sock.sendMessage(chatId, {
    text: rulesText
  }, { quoted: message });
}

module.exports = {
  sayCommand,
  timeCommand,
  rulesCommand
};
