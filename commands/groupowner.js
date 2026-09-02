const { formatMessage, keyValue, bulletList } = require('../lib/messageStyler');

module.exports = {
    name: "groupowner",
    aliases: ["owner", "creator", "createur", "créateur", "propriétaire"],
    description: "Affiche les informations du propriétaire du groupe",
    groupOnly: true,

    async execute(sock, m) {
        try {
            const metadata = await sock.groupMetadata(m.chat);
            
            if (!metadata.owner) {
                return sock.sendMessage(m.chat, {
                    text: formatMessage('Impossible de déterminer le propriétaire de ce groupe.', { 
                        title: '👑 PROPRIÉTAIRE', 
                        status: 'warning' 
                    })
                });
            }

            const ownerJid = metadata.owner;
            const ownerName = metadata.participants.find(p => p.id === ownerJid)?.pushName || 'Inconnu';
            const ownerNumber = ownerJid.split('@')[0];
            
            let messageContent = `${keyValue('Groupe', metadata.subject)}\n`;
            messageContent += `${keyValue('Propriétaire', `@${ownerNumber}`)}\n`;
            messageContent += `${keyValue('Nom', ownerName)}\n`;
            messageContent += `${keyValue('Membres', metadata.participants.length)}\n`;
            messageContent += `${keyValue('Admins', metadata.participants.filter(p => p.admin).length)}`;

            await sock.sendMessage(m.chat, {
                text: formatMessage(messageContent, { title: '👑 PROPRIÉTAIRE', frameType: 'shadow' }),
                mentions: [ownerJid]
            });
        } catch (err) {
            console.error('Erreur groupowner:', err);
            await sock.sendMessage(m.chat, {
                text: formatMessage('Impossible de récupérer les informations du propriétaire.', { 
                    title: '❌ PROPRIÉTAIRE', 
                    status: 'error' 
                })
            });
        }
    }
};
