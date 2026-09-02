const fs = require('fs');
const isOwnerOrSudo = require('../lib/isOwner');

const PMBLOCKER_PATH = './data/pmblocker.json';

function readState() {
  try {
    if (!fs.existsSync(PMBLOCKER_PATH)) return { enabled: false, message: '⚠️ Direct messages are blocked!\nYou cannot DM this bot. Please contact the owner in group chats only.' };
    const raw = fs.readFileSync(PMBLOCKER_PATH, 'utf8');
    const data = JSON.parse(raw || '{}');
    return {
      enabled: !!data.enabled,
      message: typeof data.message === 'string' && data.message.trim() ? data.message : '⚠️ Direct messages are blocked!\nYou cannot DM this bot. Please contact the owner in group chats only.'
    };
  } catch {
    return { enabled: false, message: '⚠️ Direct messages are blocked!\nYou cannot DM this bot. Please contact the owner in group chats only.' };
  }
}

function writeState(enabled, message) {
  try {
    if (!fs.existsSync('./data')) fs.mkdirSync('./data', { recursive: true });
    const current = readState();
    const payload = {
      enabled: !!enabled,
      message: typeof message === 'string' && message.trim() ? message : current.message
    };
    fs.writeFileSync(PMBLOCKER_PATH, JSON.stringify(payload, null, 2));
  } catch {}
}

async function pmblockerCommand(sock, chatId, message, args) {
  const senderId = message.key.participant || message.key.remoteJid;
  const isOwner = await isOwnerOrSudo(senderId, sock, chatId);

  if (!message.key.fromMe && !isOwner) {
    await sock.sendMessage(chatId, { text: "Seul le propri\xE9taire du bot peut utiliser cette commande\xA0!" }, { quoted: message });
    return;
  }

  const argStr = (args || '').trim();
  const [sub, ...rest] = argStr.split(' ');
  const state = readState();

  if (!sub || !['on', 'off', 'status', 'setmsg'].includes(sub.toLowerCase())) {
    await sock.sendMessage(chatId, { text: "*PMBLOCKER (Propri\xE9taire uniquement)* .pmblocker activ\xE9 - Activer le blocage automatique des PM .pmblocker off - D\xE9sactiver le bloqueur PM .pmblocker status - Afficher l'\xE9tat actuel .pmblocker setmsg <text> - D\xE9finir un message d'avertissement" }, { quoted: message });
    return;
  }

  if (sub.toLowerCase() === 'status') {
    await sock.sendMessage(chatId, { text: `PM Blocker est actuellement *${state.enabled ? 'ON' : 'OFF'}*\nMessage : ${state.message}` }, { quoted: message });
    return;
  }

  if (sub.toLowerCase() === 'setmsg') {
    const newMsg = rest.join(' ').trim();
    if (!newMsg) {
      await sock.sendMessage(chatId, { text: 'Usage: .pmblocker setmsg <message>' }, { quoted: message });
      return;
    }
    writeState(state.enabled, newMsg);
    await sock.sendMessage(chatId, { text: "Message du bloqueur PM mis \xE0 jour." }, { quoted: message });
    return;
  }

  const enable = sub.toLowerCase() === 'on';
  writeState(enable);
  await sock.sendMessage(chatId, { text: `PM Blocker est désormais *${enable ? 'ENABLED' : 'DISABLED'}*.` }, { quoted: message });
}

module.exports = { pmblockerCommand, readState };