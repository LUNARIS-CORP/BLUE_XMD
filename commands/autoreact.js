const config = require('../config');
const settings = require('../settings');
const { formatMessage, keyValue } = require('../lib/messageStyler');
const { getBotSettings, setBotSetting } = require('../lib/botSettings');

module.exports = {
    name: "autoreact",
    aliases: ["reactauto"],
    description: "Active ou désactive les réactions automatiques",
    ownerOnly: true,

    async execute(sock, m, args) {
        const action = args[0]?.toLowerCase();

        try {
            if (['on', 'true', '1', 'activer'].includes(action)) {
                await setBotSetting('autoReactEnabled', true);
                return sock.sendMessage(m.chat, {
                    text: formatMessage(
                        `${keyValue('Auto-react', 'activé')}\n${keyValue('Action', 'le bot réagira automatiquement aux messages')}`,
                        { title: '✨ AUTOREACT', status: 'success' }
                    )
                });
            }

            if (['off', 'false', '0', 'desactiver', 'désactiver'].includes(action)) {
                await setBotSetting('autoReactEnabled', false);
                return sock.sendMessage(m.chat, {
                    text: formatMessage(
                        keyValue('Auto-react', 'désactivé'),
                        { title: '✨ AUTOREACT', status: 'warning' }
                    )
                });
            }

            const botSettings = await getBotSettings();
            const active = botSettings.autoReactEnabled ?? settings.autoReact?.enabled;
            return sock.sendMessage(m.chat, {
                text: formatMessage(
                    `${keyValue('État', active ? '🟢 ACTIVÉ' : '🔴 DÉSACTIVÉ')}\n` +
                    `${keyValue('Activer', `${config.prefix}autoreact on`)}\n` +
                    `${keyValue('Désactiver', `${config.prefix}autoreact off`)}`,
                    { title: '✨ AUTOREACT', frameType: 'shadow' }
                )
            });
        } catch (err) {
            await sock.sendMessage(m.chat, {
                text: formatMessage("Impossible de modifier l'auto-react.", { title: '❌ AUTOREACT', status: 'error' })
            });
        }
    }
};
