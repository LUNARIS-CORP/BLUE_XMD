// commands/clearwarns.js - Effacer les warns
const config = require('../config');
const { formatMessage, keyValue } = require('../lib/messageStyler');
const { clearWarns } = require('../lib/database');

module.exports = {
    name: "clearwarns",
    aliases: ["resetwarns"],
    description: "Efface les warns d'un membre",
    groupOnly: true,
    
    async execute(sock, m, args) {
        let target;
        
        if (m.quoted) target = m.quoted.sender || m.quoted.key.participant || m.quoted.key.remoteJid;
        else if (m.mentions?.length) target = m.mentions[0];
        else if (args[0]) {
            const mention = args[0].match(/@(\d+)/);
            if (mention) target = mention[1] + '@s.whatsapp.net';
        }
        
        if (!target) return sock.sendMessage(m.chat, {
            text: formatMessage(`${keyValue('Réponse', `${config.prefix}clearwarns`)}\n${keyValue('Mention', `${config.prefix}clearwarns @user`)}`, { title: '🔄 RESET WARNS', status: 'warning' })
        });
        
        try {
            const cleared = await clearWarns(target, m.chat);
            await sock.sendMessage(m.chat, {
                text: formatMessage(`✅ ${cleared} warn(s) effacé(s) pour @${target.split('@')[0]}`, { title: '🔄 RESET', status: 'success' }),
                mentions: [target]
            });
        } catch (err) {
            await sock.sendMessage(m.chat, { text: formatMessage('Impossible de nettoyer les warns.', { title: '❌ RESET WARNS', status: 'error' }) });
        }
    }
};
