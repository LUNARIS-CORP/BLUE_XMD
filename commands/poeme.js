const { formatMessage } = require('../lib/messageStyler');
const { pickRandom } = require('../lib/simpleCommandUtils');
const { poemes } = require('../lib/funCollections');

module.exports = {
    name: "poeme",
    aliases: ["poème", "shayari"],
    description: "Petit texte poétique",

    async execute(sock, m) {
        await sock.sendMessage(m.chat, {
            text: formatMessage(pickRandom(poemes), { title: '🪶 POÈME', frameType: 'shadow' })
        });
    }
};
