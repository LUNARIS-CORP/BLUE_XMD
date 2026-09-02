// commands/3412.js - Récupère vue unique en furtif (propriétaire seulement)
const { downloadContentFromMessage, downloadMediaMessage, normalizeMessageContent, extractMessageContent, getContentType } = require('@whiskeysockets/baileys');
const { formatMessage, keyValue } = require('../lib/messageStyler');
const config = require('../config');

async function streamToBuffer(stream) {
    const chunks = [];

    for await (const chunk of stream) {
        chunks.push(chunk);
    }

    return Buffer.concat(chunks);
}

async function downloadMedia(sock, mediaInfo) {
    try {
        const stream = await downloadContentFromMessage(mediaInfo.content, mediaInfo.mediaType);
        return await streamToBuffer(stream);
    } catch (directError) {
        if (process.env.BOT_DEBUG === '1') {
            console.error('[3412] direct download failed:', directError.message);
        }

        const quotedKey = mediaInfo.key;
        if (!quotedKey?.id) throw directError;

        const quotedWAMessage = {
            key: quotedKey,
            message: mediaInfo.inner
        };

        return downloadMediaMessage(
            quotedWAMessage,
            'buffer',
            {},
            {
                logger: { info() {}, warn() {}, error() {}, debug() {} },
                reuploadRequest: sock.updateMediaMessage?.bind(sock)
            }
        );
    }
}

function getOwnerRecipients() {
    return String(config.ownerJid || '')
        .split(',')
        .map(jid => jid.trim())
        .filter(Boolean);
}

async function sendToOwners(sock, content, options = {}) {
    const recipients = getOwnerRecipients();
    if (recipients.length === 0) {
        throw new Error('Aucun ownerJid configuré');
    }

    let sent = 0;
    let lastError = null;

    for (const jid of recipients) {
        try {
            await sock.sendMessage(jid, content, options);
            sent++;
        } catch (err) {
            lastError = err;
            console.error(`[3412] Envoi owner échoué (${jid}):`, err.message);
        }
    }

    if (sent === 0 && lastError) {
        throw lastError;
    }

    return sent;
}

function getQuotedInfo(m) {
    const raw = m.raw?.message || {};
    const direct = m.message || {};
    const contexts = [
        { message: m.quoted?.message, key: m.quoted?.key, contextInfo: m.quoted?.contextInfo },
        { message: direct?.extendedTextMessage?.contextInfo?.quotedMessage, contextInfo: direct?.extendedTextMessage?.contextInfo },
        { message: direct?.imageMessage?.contextInfo?.quotedMessage, contextInfo: direct?.imageMessage?.contextInfo },
        { message: direct?.videoMessage?.contextInfo?.quotedMessage, contextInfo: direct?.videoMessage?.contextInfo },
        { message: direct?.audioMessage?.contextInfo?.quotedMessage, contextInfo: direct?.audioMessage?.contextInfo },
        { message: raw?.extendedTextMessage?.contextInfo?.quotedMessage, contextInfo: raw?.extendedTextMessage?.contextInfo },
        { message: raw?.imageMessage?.contextInfo?.quotedMessage, contextInfo: raw?.imageMessage?.contextInfo },
        { message: raw?.videoMessage?.contextInfo?.quotedMessage, contextInfo: raw?.videoMessage?.contextInfo },
        { message: raw?.audioMessage?.contextInfo?.quotedMessage, contextInfo: raw?.audioMessage?.contextInfo }
    ];

    const found = contexts.find(item => item.message);
    if (!found) return null;
    const senderFallback = m.isGroup ? '' : m.sender;

    if (!found.key && found.contextInfo) {
        found.key = {
            remoteJid: found.contextInfo.remoteJid || m.chat,
            fromMe: false,
            id: found.contextInfo.stanzaId,
            participant: found.contextInfo.participant || found.contextInfo.participantPn || found.contextInfo.participantLid || senderFallback,
            participantPn: found.contextInfo.participantPn || '',
            participantLid: found.contextInfo.participantLid || ''
        };
    }

    if (found.key && found.contextInfo) {
        found.key = {
            ...found.key,
            remoteJid: found.key.remoteJid || found.contextInfo.remoteJid || m.chat,
            id: found.key.id || found.contextInfo.stanzaId,
            participant: found.key.participant || found.contextInfo.participant || found.contextInfo.participantPn || found.contextInfo.participantLid || senderFallback,
            participantPn: found.key.participantPn || found.contextInfo.participantPn || '',
            participantLid: found.key.participantLid || found.contextInfo.participantLid || ''
        };
    }

    found.authorCandidates = collectJidCandidates(found.contextInfo, found.message, found.key);

    return found;
}

function collectJidCandidates(...values) {
    const candidates = [];
    const seen = new Set();

    const add = (value) => {
        const text = String(value || '').trim();
        if (!text || seen.has(text)) return;
        seen.add(text);
        candidates.push(text);
    };

    const walk = (value, depth = 0) => {
        if (!value || depth > 8) return;

        if (typeof value === 'string') {
            if (value.includes('@')) add(value);
            return;
        }

        if (Array.isArray(value)) {
            value.forEach(item => walk(item, depth + 1));
            return;
        }

        if (typeof value !== 'object') return;

        [
            value.participantPn,
            value.participant,
            value.participantLid,
            value.senderPn,
            value.sender,
            value.senderLid,
            value.remoteJid
        ].forEach(add);

        if (value.contextInfo) walk(value.contextInfo, depth + 1);
        if (value.message) walk(value.message, depth + 1);
        if (value.quotedMessage) walk(value.quotedMessage, depth + 1);

        for (const nested of Object.values(value)) {
            if (nested && typeof nested === 'object') walk(nested, depth + 1);
        }
    };

    values.forEach(value => walk(value));
    return candidates.filter(candidate => !String(candidate).endsWith('@g.us'));
}

function unwrapMessage(message) {
    let current = message;

    while (current) {
        const normalized = normalizeMessageContent(current) || current;
        const extracted = extractMessageContent(normalized) || normalized;

        if (extracted?.ephemeralMessage?.message) {
            current = extracted.ephemeralMessage.message;
            continue;
        }

        if (extracted?.viewOnceMessageV2Extension?.message) {
            current = extracted.viewOnceMessageV2Extension.message;
            continue;
        }

        if (extracted?.viewOnceMessageV2?.message) {
            current = extracted.viewOnceMessageV2.message;
            continue;
        }

        if (extracted?.viewOnceMessage?.message) {
            current = extracted.viewOnceMessage.message;
            continue;
        }

        if (extracted?.documentWithCaptionMessage?.message) {
            current = extracted.documentWithCaptionMessage.message;
            continue;
        }

        return extracted;
    }

    return null;
}

function resolveQuotedViewOnceMessage(m) {
    const quoted = getQuotedInfo(m);
    if (!quoted?.message) return null;

    const quotedMessage = quoted.message;
    const inner = unwrapMessage(quotedMessage);
    const type = getContentType(inner) || Object.keys(inner || {})[0];
    const image = inner?.imageMessage || inner?.documentWithCaptionMessage?.message?.imageMessage;
    const video = inner?.videoMessage || inner?.documentWithCaptionMessage?.message?.videoMessage;
    const audio = inner?.audioMessage || inner?.documentWithCaptionMessage?.message?.audioMessage;
    const authorCandidates = collectJidCandidates(quoted.authorCandidates, quoted.key, quotedMessage, inner, image, video, audio);

    if (process.env.BOT_DEBUG === '1') {
        console.log('[3412] quoted keys:', Object.keys(quotedMessage || {}));
        console.log('[3412] inner keys:', Object.keys(inner || {}));
        console.log('[3412] detected type:', type);
        console.log('[3412] author candidates:', authorCandidates);
    }

    if (image) {
        return { mediaType: 'image', content: image, inner, key: quoted.key, authorCandidates };
    }

    if (video) {
        return { mediaType: 'video', content: video, inner, key: quoted.key, authorCandidates };
    }

    if (audio) {
        return { mediaType: 'audio', content: audio, inner, key: quoted.key, authorCandidates };
    }

    return null;
}

function normalizeJid(jid = '') {
    return String(jid || '').trim().replace(/:\d+@/, '@');
}

function phoneFromJid(jid = '') {
    return String(jid || '').split('@')[0].split(':')[0].replace(/\D/g, '');
}

function findParticipant(metadata, jidOrJids) {
    const lookupValues = Array.isArray(jidOrJids) ? jidOrJids : [jidOrJids];
    const normalizedLookups = lookupValues.map(normalizeJid).filter(Boolean);
    const phones = lookupValues.map(phoneFromJid).filter(Boolean);

    return metadata?.participants?.find(participant => {
        const candidates = [
            participant.id,
            participant.jid,
            participant.lid,
            participant.phoneNumber
        ].filter(Boolean);

        return candidates.some(candidate =>
            normalizedLookups.includes(normalizeJid(candidate)) ||
            phones.includes(phoneFromJid(candidate))
        );
    }) || null;
}

function getParticipantName(participant, fallbackJid = '') {
    const name = participant?.name ||
        participant?.notify ||
        participant?.verifiedName ||
        participant?.pushName ||
        '';

    return cleanDisplayName(name) || cleanDisplayName(fallbackJid) || 'Utilisateur inconnu';
}

function cleanDisplayName(value = '') {
    const text = String(value || '').trim();
    if (!text || text === 'Inconnu') return '';
    if (text.includes('@')) return '';
    if (/^\+?\d{6,}$/.test(text.replace(/\s+/g, ''))) return '';
    return text;
}

async function resolveUserName(sock, jidOrJids, metadata = null, fallbackName = '') {
    const jids = (Array.isArray(jidOrJids) ? jidOrJids : [jidOrJids]).filter(Boolean);
    const participant = metadata ? findParticipant(metadata, jids) : null;
    const metadataName = getParticipantName(participant);
    if (metadataName !== 'Utilisateur inconnu') return metadataName;

    const cleanFallback = cleanDisplayName(fallbackName);
    if (cleanFallback) return cleanFallback;

    const cachedName = getCachedUserName([
        participant?.id,
        participant?.jid,
        participant?.phoneNumber,
        participant?.lid,
        ...jids
    ]);
    if (cachedName) return cachedName;

    if (typeof sock.getName === 'function') {
        const nameCandidates = [
            participant?.id,
            participant?.jid,
            participant?.phoneNumber,
            participant?.lid,
            ...jids
        ].filter(Boolean);

        for (const candidate of [...new Set(nameCandidates.map(normalizeJid).filter(Boolean))]) {
            try {
                const socketName = cleanDisplayName(await sock.getName(candidate));
                if (socketName) return socketName;
            } catch {}
        }
    }

    if (process.env.BOT_DEBUG === '1') {
        console.log('[3412] Nom utilisateur introuvable pour:', jids);
        if (participant) console.log('[3412] Participant metadata:', participant);
    }

    return 'Utilisateur inconnu';
}

function getCachedUserName(jids = []) {
    const cache = global.userNames;
    if (!cache || typeof cache.get !== 'function') return '';

    for (const jid of jids.filter(Boolean)) {
        const name = cleanDisplayName(cache.get(normalizeJid(jid)));
        if (name) return name;
    }

    return '';
}

async function getSourceContext(sock, m, mediaInfo) {
    const sourceChat = mediaInfo?.key?.remoteJid || m.chat;
    const sourceSenderCandidates = [
        ...(mediaInfo?.authorCandidates || []),
        mediaInfo?.key?.participantPn,
        mediaInfo?.key?.participant,
        mediaInfo?.key?.participantLid,
        m.quoted?.key?.participantPn,
        m.quoted?.key?.participant,
        m.quoted?.key?.participantLid,
        m.quoted?.sender,
        ...(m.isGroup ? [] : [m.sender])
    ].filter(Boolean);
    const requesterCandidates = [
        m.senderPn,
        m.sender,
        m.senderLid,
        m.key?.participantPn,
        m.key?.participant,
        m.key?.participantLid,
        m.raw?.key?.participantPn,
        m.raw?.key?.participant,
        m.raw?.key?.participantLid
    ].filter(Boolean);
    const requesterFallback = m.senderName || '';

    let groupName = sourceChat;
    let sourceMetadata = null;

    try {
        if (String(sourceChat || '').endsWith('@g.us')) {
            sourceMetadata = await sock.groupMetadata(sourceChat);
            groupName = sourceMetadata?.subject || 'Groupe inconnu';
        } else {
            groupName = 'Prive';
        }
    } catch {
        groupName = m.isGroup ? 'Groupe inconnu' : 'Prive';
    }

    let requesterMetadata = null;
    if (m.isGroup && m.chat === sourceChat) {
        requesterMetadata = sourceMetadata;
    } else if (m.isGroup) {
        try {
            requesterMetadata = await sock.groupMetadata(m.chat);
        } catch {}
    }

    return {
        groupName,
        sourceType: String(sourceChat || '').endsWith('@g.us') ? 'Groupe' : 'Prive',
        sourceLabel: String(sourceChat || '').endsWith('@g.us') ? 'Groupe source' : 'Conversation source',
        sourceName: await resolveUserName(sock, sourceSenderCandidates, sourceMetadata),
        requesterName: await resolveUserName(sock, requesterCandidates, requesterMetadata, requesterFallback)
    };
}

function getMediaLabel(mediaInfo) {
    if (mediaInfo?.mediaType === 'audio') {
        return mediaInfo.content?.ptt ? 'Vocal' : 'Audio';
    }

    if (mediaInfo?.mediaType === 'image') return 'Photo';
    if (mediaInfo?.mediaType === 'video') return 'Video';
    return 'Media';
}

function buildDetailsMessage(mediaInfo, sourceContext) {
    const duration = mediaInfo?.content?.seconds
        ? `\n${keyValue('Duree', `${mediaInfo.content.seconds}s`)}`
        : '';
    const mimetype = mediaInfo?.content?.mimetype
        ? `\n${keyValue('Format', mediaInfo.content.mimetype)}`
        : '';
    const messageId = mediaInfo?.key?.id
        ? `\n${keyValue('Message ID', mediaInfo.key.id)}`
        : '';
    const recoveredAt = new Date().toLocaleString('fr-FR');

    return formatMessage(
        `${keyValue('Vue unique', 'recuperee (furtif)')}\n` +
        `${keyValue('Type', getMediaLabel(mediaInfo))}\n` +
        `${keyValue('Auteur', sourceContext.sourceName)}\n` +
        `${keyValue('Source', sourceContext.sourceType)}\n` +
        `${keyValue(sourceContext.sourceLabel, sourceContext.groupName)}\n` +
        `${keyValue('Recupere par', sourceContext.requesterName)}\n` +
        `${keyValue('Date', recoveredAt)}${duration}${mimetype}${messageId}\n` +
        `${keyValue('Credits', 'N9uf_S')}\n` +
        `${keyValue('Company', 'N9uf_S Projects')}`,
        { title: '🖼️ VV FURTIF', status: 'success' }
    );
}

module.exports = {
    name: '3412',
    aliases: [],
    description: 'Récupère une photo/vidéo/audio vue unique en furtif (propriétaire uniquement)',
    ownerOnly: true,

    async execute(sock, m) {
        const mediaInfo = resolveQuotedViewOnceMessage(m);
        const sourceContext = await getSourceContext(sock, m, mediaInfo);
        const detailsMsg = mediaInfo ? buildDetailsMessage(mediaInfo, sourceContext) : '';
        
        try {
            if (!mediaInfo) {
                await sendToOwners(sock, {
                    text: formatMessage(
                        `${keyValue('Erreur', 'pas de vue unique')}\n` +
                        `${keyValue('Utilisateur', sourceContext.requesterName)}\n` +
                        `${keyValue('Source', sourceContext.groupName)}\n` +
                        `${keyValue('Commande', `${config.prefix}3412`)}`,
                        { title: '❌ VV FURTIF', status: 'warning' }
                    )
                });
                return;
            }

            const buffer = await downloadMedia(sock, mediaInfo);

            if (mediaInfo.mediaType === 'image') {
                await sendToOwners(sock, { image: buffer, caption: detailsMsg });
                return;
            }

            if (mediaInfo.mediaType === 'video') {
                await sendToOwners(sock, { video: buffer, caption: detailsMsg });
                return;
            }

            await sendToOwners(sock, { text: detailsMsg });
            await sendToOwners(sock, {
                audio: buffer,
                mimetype: mediaInfo.content?.mimetype || (mediaInfo.content?.ptt ? 'audio/ogg; codecs=opus' : 'audio/mp4'),
                ptt: mediaInfo.content?.ptt === true
            });
        } catch (e) {
            console.error('Erreur 3412:', e);
            await sendToOwners(sock, {
                text: formatMessage(
                    `Impossible de récupérer le média vue unique.\n${keyValue('Erreur', e.message || 'inconnue')}`,
                    { title: '❌ VV FURTIF', status: 'error' }
                )
            });
        }
    }
};
