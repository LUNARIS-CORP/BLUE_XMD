// commands/setprefix.js - Changer le préfixe du bot
const fs = require('fs');
const path = require('path');
const config = require('../config');
const { formatMessage, keyValue } = require('../lib/messageStyler');

module.exports = {
    name: "setprefix",
    aliases: ["prefix", "changeprefix"],
    description: "Change le préfixe du bot",
    ownerOnly: true,

    async execute(sock, m, args) {
        const nextPrefix = args[0];

        if (!nextPrefix) {
            return sock.sendMessage(m.chat, {
                text: formatMessage(
                    `${keyValue('Préfixe actuel', config.prefix)}\n` +
                    `${keyValue('Changer', `${config.prefix}setprefix !`)}`,
                    { title: '🔧 PREFIX', frameType: 'shadow' }
                )
            });
        }

        if (nextPrefix.length > 3 || /\s/.test(nextPrefix)) {
            return sock.sendMessage(m.chat, {
                text: formatMessage(
                    `${keyValue('Préfixe refusé', nextPrefix)}\n` +
                    `${keyValue('Règle', '1 à 3 caractères sans espace')}`,
                    { title: '❌ PREFIX', status: 'error' }
                )
            });
        }

        try {
            const oldPrefix = config.prefix;
            config.prefix = nextPrefix;
            persistPrefix(nextPrefix);

            await sock.sendMessage(m.chat, {
                text: formatMessage(
                    `${keyValue('Ancien', oldPrefix)}\n` +
                    `${keyValue('Nouveau', nextPrefix)}\n` +
                    `${keyValue('Exemple', `${nextPrefix}menu`)}`,
                    { title: '🔧 PREFIX', status: 'success' }
                )
            });
        } catch (err) {
            console.error('Erreur setprefix:', err.message);
            await sock.sendMessage(m.chat, {
                text: formatMessage("Impossible de changer le préfixe.", { title: '❌ PREFIX', status: 'error' })
            });
        }
    }
};

function persistPrefix(prefix) {
    const configPath = path.join(__dirname, '..', 'config.js');
    const source = fs.readFileSync(configPath, 'utf8');
    const escaped = prefix.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const next = source.replace(/prefix:\s*["'][^"']*["']/, `prefix: "${escaped}"`);
    fs.writeFileSync(configPath, next);
    delete require.cache[require.resolve('../config')];
}
