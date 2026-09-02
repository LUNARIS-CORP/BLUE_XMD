// commands/warns.js - Voir les warns
const config = require('../config');
const { formatMessage, asciiArt, keyValue } = require('../lib/messageStyler');
const { getWarns } = require('../lib/database');

module.exports = {
    name: "warns",
    aliases: ["warnings"],
    description: "Affiche les warns d'un membre",
    groupOnly: true,
    
    async execute(sock, m, args) {
        let target = m.sender;
        
        if (m.quoted) target = m.quoted.key.participant || m.quoted.key.remoteJid;
        else if (args[0]) {
            const mention = args[0].match(/@(\d+)/);
            if (mention) target = mention[1] + '@s.whatsapp.net';
        }
        
        try {
            const warns = await getWarns(target, m.chat);
            let warnList = warns.length === 0 ? `${asciiArt.success} Aucun warn enregistré` : '';
            
            warns.slice(0, 10).forEach((w, i) => {
                const date = new Date(w.created_at).toLocaleDateString('fr-FR');
                warnList += `${asciiArt.bullet} *${i + 1}.* ${w.reason}\n${keyValue('Date', date)}\n${keyValue('Par', `@${w.warned_by.split('@')[0]}`)}\n`;
            });
            
            await sock.sendMessage(m.chat, {
                text: formatMessage(
                    `${keyValue('Membre', `@${target.split('@')[0]}`)}\n${keyValue('Total', `${warns.length}/${config.maxWarns}`)}\n\n${warnList}`,
                    { title: '📋 WARNS', frameType: 'shadow' }
                ),
                mentions: [target, ...warns.map(w => w.warned_by)]
            });
        } catch (err) {
            await sock.sendMessage(m.chat, { text: formatMessage('Impossible de lire les warns.', { title: '❌ WARNS', status: 'error' }) });
        }
    }
};
