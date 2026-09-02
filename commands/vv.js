// commands/vv.js - Récupère une image/vidéo/audio vue unique
const { downloadContentFromMessage, downloadMediaMessage, normalizeMessageContent, extractMessageContent, getContentType } = require('@whiskeysockets/baileys');
const config = require('../config');
const { formatMessage, keyValue } = require('../lib/messageStyler');

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
            console.error('[VV] direct download failed:', directError.message);
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

function getQuotedInfo(m) {
    const raw = m.raw?.message || {};
    const direct = m.message || {};
    const contexts = [
        { message: m.quoted?.message, key: m.quoted?.key },
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

    if (!found.key && found.contextInfo) {
        found.key = {
            remoteJid: found.contextInfo.remoteJid || m.chat,
            fromMe: false,
            id: found.contextInfo.stanzaId,
            participant: found.contextInfo.participant || m.sender
        };
    }

    return found;
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

    if (process.env.BOT_DEBUG === '1') {
        console.log('[VV] quoted keys:', Object.keys(quotedMessage || {}));
        console.log('[VV] inner keys:', Object.keys(inner || {}));
        console.log('[VV] detected type:', type);
    }

    if (image) {
        return { mediaType: 'image', content: image, inner, quotedMessage, key: quoted.key };
    }

    if (video) {
        return { mediaType: 'video', content: video, inner, quotedMessage, key: quoted.key };
    }

    if (audio) {
        return { mediaType: 'audio', content: audio, inner, quotedMessage, key: quoted.key };
    }

    return null;
}

module.exports = {
    name: 'vv',
    aliases: ['viewonce', 'view-once', 'v1', 'vuesunique', 'vueunique'],
    description: 'Récupère une photo/vidéo/audio vue unique en réponse',

    async execute(sock, m) {
        const mediaInfo = resolveQuotedViewOnceMessage(m);

        const successMsg = formatMessage(
            `${keyValue('Vue unique', 'récupérée')}\n${keyValue('Prefix', config.prefix)}\n${keyValue('Mode', 'global')}\n${keyValue('Credits', 'N9uf_S')}\n${keyValue('Company', 'N9uf_S Projects')}`,
            { title: '🖼️ VV', status: 'success' }
        );

        try {
            if (!mediaInfo) {
                await sock.sendMessage(m.chat, {
                    text: formatMessage(
                        `${keyValue('Usage', 'réponds à une photo/vidéo/audio vue unique')}\n${keyValue('Commande', `${config.prefix}vv`)}`,
                        { title: '❌ VV', status: 'warning' }
                    )
                });
                return;
            }

            const buffer = await downloadMedia(sock, mediaInfo);

            if (mediaInfo.mediaType === 'image') {
                await sock.sendMessage(m.chat, { image: buffer, caption: successMsg });
                return;
            }

            if (mediaInfo.mediaType === 'video') {
                await sock.sendMessage(m.chat, { video: buffer, caption: successMsg });
                return;
            }

            await sock.sendMessage(m.chat, {
                audio: buffer,
                mimetype: mediaInfo.content?.mimetype || (mediaInfo.content?.ptt ? 'audio/ogg; codecs=opus' : 'audio/mp4'),
                ptt: mediaInfo.content?.ptt === true
            });
        } catch (e) {
            console.error('Erreur vv:', e);
            await sock.sendMessage(m.chat, {
                text: formatMessage(
                    `Impossible de récupérer le média vue unique.\n${keyValue('Erreur', e.message || 'inconnue')}`,
                    { title: '❌ VV', status: 'error' }
                )
            });
        }
    }
};
