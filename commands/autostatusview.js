const config = require('../config');
const settings = require('../settings');
const { formatMessage, keyValue } = require('../lib/messageStyler');
const { getBotSettings, setBotSetting } = require('../lib/botSettings');

module.exports = {
    name: "autostatusview",
    aliases: ["status view", "viewstatus"],
    description: "Active ou désactive la vue automatique des statuts",
    ownerOnly: true,

    async execute(sock, m, args) {
        const action = args[0]?.toLowerCase();

        try {
            if (['on', 'true', '1', 'activer'].includes(action)) {
                await setBotSetting('autoStatusViewEnabled', true);
                return sock.sendMessage(m.chat, {
                    text: formatMessage(
                        `${keyValue('Auto-status-view', 'activé')}\n${keyValue('Action', 'le bot marquera les statuts comme vus')}`,
                        { title: '👁️ STATUS VIEW', status: 'success' }
                    )
                });
            }

            if (['off', 'false', '0', 'desactiver', 'désactiver'].includes(action)) {
                await setBotSetting('autoStatusViewEnabled', false);
                return sock.sendMessage(m.chat, {
                    text: formatMessage(
                        keyValue('Auto-status-view', 'désactivé'),
                        { title: '👁️ STATUS VIEW', status: 'warning' }
                    )
                });
            }

            const botSettings = await getBotSettings();
            const active = botSettings.autoStatusViewEnabled ?? settings.autoStatusView?.enabled;
            return sock.sendMessage(m.chat, {
                text: formatMessage(
                    `${keyValue('État', active ? '🟢 ACTIVÉ' : '🔴 DÉSACTIVÉ')}\n` +
                    `${keyValue('Activer', `${config.prefix}autostatusview on`)}\n` +
                    `${keyValue('Désactiver', `${config.prefix}autostatusview off`)}`,
                    { title: '👁️ STATUS VIEW', frameType: 'shadow' }
                )
            });
        } catch (err) {
            await sock.sendMessage(m.chat, {
                text: formatMessage("Impossible de modifier l'auto-status-view.", { title: '❌ STATUS VIEW', status: 'error' })
            });
        }
    }
};
