const { formatMessage, keyValue, bulletList } = require('../lib/messageStyler');

module.exports = {
    name: "admins",
    aliases: ["staff"],
    description: "Liste les admins et le propriétaire du groupe",
    groupOnly: true,

    async execute(sock, m) {
        try {
            const metadata = await sock.groupMetadata(m.chat);
            const admins = metadata.participants.filter(p => p.admin === 'admin').map(p => p.id);
            const owner = metadata.owner;
            
            let mentions = [];
            let messageContent = `${keyValue('Groupe', metadata.subject)}\n`;
            
            if (owner) {
                mentions.push(owner);
                messageContent += `${keyValue('👑 Propriétaire', `@${owner.split('@')[0]}`)}\n`;
            }
            
            if (admins.length > 0) {
                mentions.push(...admins);
                messageContent += `${keyValue('👮 Admins', admins.length)}\n${bulletList(admins.map(id => `@${id.split('@')[0]}`))}`
            } else {
                messageContent += `${keyValue('👮 Admins', 'Aucun')}`;
            }

            await sock.sendMessage(m.chat, {
                text: formatMessage(messageContent, { title: '👥 STAFF', frameType: 'shadow' }),
                mentions: mentions
            });
        } catch (err) {
            await sock.sendMessage(m.chat, {
                text: formatMessage('Impossible de lister les admins.', { title: '❌ ADMINS', status: 'error' })
            });
        }
    }
};
