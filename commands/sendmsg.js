const config = require('../config');
const { formatMessage, keyValue } = require('../lib/messageStyler');

function normalizeJid(jid = '') {
    return String(jid || '').trim().replace(/:\d+@/, '@');
}

function phoneFromText(value = '') {
    return String(value || '').replace(/\D/g, '');
}

function getDisplayName(jid = '') {
    const cache = global.userNames;
    const cached = cache?.get?.(normalizeJid(jid));
    if (cached) return cached;
    const phone = phoneFromText(jid);
    return phone ? `+${phone}` : 'Utilisateur';
}

function extractExplicitTarget(raw = '') {
    const text = String(raw || '').trim();
    const mention = text.match(/@(\d{6,})/);
    if (mention) {
        return {
            jid: `${mention[1]}@s.whatsapp.net`,
            rest: text.replace(mention[0], '').trim()
        };
    }

    const jid = text.match(/\b(\d{6,}@s\.whatsapp\.net|\d{6,}@lid)\b/i);
    if (jid) {
        return {
            jid: normalizeJid(jid[1]),
            rest: text.replace(jid[1], '').trim()
        };
    }

    const firstToken = text.split(/\s+/)[0] || '';
    const phone = phoneFromText(firstToken);
    if (phone.length >= 8) {
        return {
            jid: `${phone}@s.whatsapp.net`,
            rest: text.slice(firstToken.length).trim()
        };
    }

    return { jid: '', rest: text };
}

function splitTargetAndMessage(m, args = []) {
    const raw = args.join(' ').trim();
    const mentionedTarget = m.mentions?.[0] || '';
    const quotedTarget = m.quoted?.sender || m.quoted?.key?.participant || '';

    let target = mentionedTarget;
    let body = raw;

    if (!target) {
        const explicit = extractExplicitTarget(raw);
        target = explicit.jid;
        body = explicit.rest;
    } else {
        const mention = raw.match(/@(\d{6,})/);
        if (mention) body = raw.replace(mention[0], '').trim();
    }

    if (!target && quotedTarget) {
        target = quotedTarget;
    }

    body = body
        .replace(/^\s*(?:->|=>|:|-|\|)\s*/, '')
        .trim();

    const separatorMatch = body.match(/^(.*?)\s*(?:\||::|=>|->)\s*([\s\S]+)$/);
    if (separatorMatch && target) {
        body = separatorMatch[2].trim();
    }

    return {
        target: normalizeJid(target),
        message: body
    };
}

module.exports = {
    name: 'sendmsg',
    aliases: ['dm', 'mp', 'messageuser', 'senduser'],
    description: 'Envoie un message privé à un utilisateur (owner uniquement)',
    ownerOnly: true,

    async execute(sock, m, args) {
        const { target, message } = splitTargetAndMessage(m, args);

        if (!target || !message) {
            return sock.sendMessage(m.chat, {
                text: formatMessage(
                    `${keyValue('Usage', `${config.prefix}sendmsg @user | message`)}\n` +
                    `${keyValue('Numéro', `${config.prefix}sendmsg 225XXXXXXXX message`)}\n` +
                    `${keyValue('Réponse', `réponds à un message puis ${config.prefix}sendmsg message`)}`,
                    { title: '✉️ SENDMSG', status: 'warning' }
                )
            });
        }

        if (target.endsWith('@g.us')) {
            return sock.sendMessage(m.chat, {
                text: formatMessage(
                    'Cette commande envoie seulement aux utilisateurs, pas aux groupes.',
                    { title: '✉️ SENDMSG', status: 'warning' }
                )
            });
        }

        await sock.sendMessage(target, { text: message }, { skipCommandQuote: true });

        return sock.sendMessage(m.chat, {
            text: formatMessage(
                `${keyValue('Envoyé à', getDisplayName(target))}\n${keyValue('Message', message)}`,
                { title: '✉️ SENDMSG', status: 'success' }
            )
        });
    }
};
