const config = require('../config');
const settings = require('../settings');
const { formatMessage, keyValue } = require('../lib/messageStyler');
const { getBotSettings, updateBotSettings, getAiAgentEnabled } = require('../lib/botSettings');

function normalizeJid(jid = '') {
    return String(jid || '').trim().replace(/:\d+@/, '@');
}

function extractPhoneNumber(value = '') {
    return String(value || '').replace(/\D/g, '');
}

function isOwnerSender(m) {
    if (m?.raw?.key?.fromMe) return true;

    const ownerJids = splitConfiguredJids(config.ownerJid);
    const ownerLids = splitConfiguredJids(config.ownerLid);
    const ownerNumbers = [
        ...splitConfiguredPhones(config.ownerJid),
        ...splitConfiguredPhones(config.ownerNumber),
        ...splitConfiguredPhones(settings.ownerNumber)
    ];
    const candidates = [
        m?.sender,
        m?.senderPn,
        m?.senderLid,
        m?.key?.participant,
        m?.raw?.key?.participant,
        m?.raw?.key?.participantPn,
        m?.raw?.key?.participantLid,
        m?.raw?.key?.remoteJid
    ].filter(Boolean);

    return candidates.some(candidate => {
        const normalized = normalizeJid(candidate);
        const number = extractPhoneNumber(candidate);

        return ownerJids.includes(normalized) ||
            ownerLids.includes(normalized) ||
            ownerNumbers.includes(number);
    });
}

function splitConfiguredJids(value = '') {
    return String(value || '')
        .split(',')
        .map(jid => normalizeJid(jid))
        .filter(Boolean);
}

function splitConfiguredPhones(value = '') {
    return String(value || '')
        .split(',')
        .map(item => extractPhoneNumber(item))
        .filter(Boolean);
}

module.exports = {
    name: 'agent',
    aliases: ['ai', 'assistant'],
    description: "Active ou désactive l'agent IA",
    ownerOnly: true,

    async execute(sock, m, args) {
        if (!isOwnerSender(m)) {
            return sock.sendMessage(m.chat, {
                text: formatMessage(
                    "Seul le propriétaire du bot peut activer ou désactiver l'agent IA.",
                    { title: '👑 OWNER ONLY', status: 'warning' }
                )
            });
        }

        const action = args[0]?.toLowerCase();

        try {
            if (['on', 'true', '1', 'activer', 'enable'].includes(action)) {
                await updateBotSettings({ aiAgentEnabled: true, agentEnabled: true });
                return sock.sendMessage(m.chat, {
                    text: formatMessage(
                        `${keyValue('Agent IA', 'activé')}\n${keyValue('Mode groupe', 'repond si on mentionne le bot ou si on repond a son message')}\n${keyValue('Mode prive', 'repond aux messages normaux')}`,
                        { title: '🧠 AGENT', status: 'success' }
                    )
                });
            }

            if (['off', 'false', '0', 'desactiver', 'désactiver', 'disable'].includes(action)) {
                await updateBotSettings({ aiAgentEnabled: false, agentEnabled: false });
                return sock.sendMessage(m.chat, {
                    text: formatMessage(
                        keyValue('Agent IA', 'désactivé'),
                        { title: '🧠 AGENT', status: 'warning' }
                    )
                });
            }

            await getBotSettings();
            const active = getAiAgentEnabled(settings.aiAgent?.enabled);
            return sock.sendMessage(m.chat, {
                text: formatMessage(
                    `${keyValue('État', active ? '🟢 ACTIVÉ' : '🔴 DÉSACTIVÉ')}\n` +
                    `${keyValue('Modèle', settings.aiAgent?.model || 'gpt-4.1-mini')}\n` +
                    `${keyValue('Mémoire', `${settings.aiAgent?.memoryMessages || 6} messages / ${settings.aiAgent?.memoryMinutes || 30} min`) }\n` +
                    `${keyValue('Activer', `${config.prefix}agent on`)}\n` +
                    `${keyValue('Désactiver', `${config.prefix}agent off`)}`,
                    { title: '🧠 AGENT', frameType: 'shadow' }
                )
            });
        } catch (err) {
            await sock.sendMessage(m.chat, {
                text: formatMessage(`Impossible de modifier l'agent IA: ${err.message}`, {
                    title: '❌ AGENT',
                    status: 'error'
                })
            });
        }
    }
};
