// commands/mode.js - Changer le mode public/private du bot
const fs = require('fs');
const path = require('path');
const config = require('../config');
const { formatMessage, keyValue } = require('../lib/messageStyler');

module.exports = {
    name: "mode",
    aliases: ["public", "private", "privé"],
    description: "Change le mode du bot",
    ownerOnly: true,

    async execute(sock, m, args) {
        const requested = getRequestedMode(m, args);
        const mode = ['public', 'publique'].includes(requested)
            ? 'public'
            : ['private', 'privé', 'prive'].includes(requested)
                ? 'private'
                : null;

        if (!mode) {
            return sock.sendMessage(m.chat, {
                text: formatMessage(
                    `${keyValue('Mode actuel', config.mode || 'public')}\n` +
                    `${keyValue('Public', `${config.prefix}mode public`)}\n` +
                    `${keyValue('Private', `${config.prefix}mode private`)}\n` +
                    `${keyValue('Règle', 'private = propriétaire seulement, public = ouvert à tous')}`,
                    { title: '🔐 MODE', frameType: 'shadow' }
                )
            });
        }

        try {
            config.mode = mode;
            process.env.BOT_MODE = mode;
            persistMode(mode);

            await sock.sendMessage(m.chat, {
                text: formatMessage(
                    `${keyValue('Mode', mode)}\n` +
                    `${keyValue('Accès', mode === 'private' ? 'propriétaire seulement' : 'ouvert à tous')}\n` +
                    `${keyValue('Statut', 'mis à jour')}`,
                    { title: '🔐 MODE', status: 'success' }
                )
            });
        } catch (err) {
            console.error('Erreur mode:', err.message);
            await sock.sendMessage(m.chat, {
                text: formatMessage("Impossible de changer le mode.", { title: '❌ MODE', status: 'error' })
            });
        }
    }
};

function persistMode(mode) {
    const configPath = path.join(__dirname, '..', 'config.js');
    const source = fs.readFileSync(configPath, 'utf8');
    const next = source.replace(/mode:\s*["'](?:public|private|privé|prive)["']/, `mode: "${mode}"`);
    fs.writeFileSync(configPath, next);
    persistEnvValue('BOT_MODE', mode);
    delete require.cache[require.resolve('../config')];
}

function getRequestedMode(m, args = []) {
    const direct = (args[0] || '').toLowerCase();
    if (direct) return direct;

    const text = String(m?.text || '').trim();
    const prefix = config.prefix || '';
    const commandName = prefix && text.startsWith(prefix)
        ? text.slice(prefix.length).trim().split(/\s+/)[0]
        : '';

    return commandName.toLowerCase();
}

function persistEnvValue(key, value) {
    const envPath = path.join(__dirname, '..', '.env');
    if (!fs.existsSync(envPath)) return;

    const source = fs.readFileSync(envPath, 'utf8');
    const escaped = String(value).replace(/\$/g, '$$$$');
    const pattern = new RegExp(`^${key}=.*$`, 'm');
    const next = pattern.test(source)
        ? source.replace(pattern, `${key}=${escaped}`)
        : `${source.replace(/\s*$/, '')}\n${key}=${escaped}\n`;

    fs.writeFileSync(envPath, next);
}
