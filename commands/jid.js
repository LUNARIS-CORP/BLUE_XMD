const { formatMessage, keyValue } = require('../lib/messageStyler');

module.exports = {
    name: "jid",
    aliases: [],
    description: "Affiche le JID du chat ou d'un message cité",

    async execute(sock, m) {
        const target = m.quoted?.sender || m.sender;
        await sock.sendMessage(m.chat, {
            text: formatMessage(
                `${keyValue('Chat', m.chat)}\n${keyValue('Utilisateur', target)}`,
                { title: '🆔 JID', frameType: 'shadow' }
            )
        });
    }
};
