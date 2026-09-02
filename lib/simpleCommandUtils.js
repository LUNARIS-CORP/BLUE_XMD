const URL_REGEX = /(?:https?:\/\/[^\s]+|chat\.whatsapp\.com\/[^\s]+|t\.me\/[^\s]+|wa\.me\/[^\s]+)/gi;

function pickRandom(items = []) {
    return items[Math.floor(Math.random() * items.length)];
}

function formatUptime(seconds) {
    seconds = Math.max(0, Math.floor(Number(seconds) || 0));
    const days = Math.floor(seconds / 86400);
    seconds %= 86400;
    const hours = Math.floor(seconds / 3600);
    seconds %= 3600;
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    const parts = [];

    if (days) parts.push(`${days}j`);
    if (hours) parts.push(`${hours}h`);
    if (minutes) parts.push(`${minutes}m`);
    parts.push(`${secs}s`);
    return parts.join(' ');
}

function getQuotedText(quoted) {
    if (!quoted) return '';

    return quoted.conversation ||
        quoted.extendedTextMessage?.text ||
        quoted.imageMessage?.caption ||
        quoted.videoMessage?.caption ||
        quoted.documentMessage?.caption ||
        quoted.content?.text ||
        quoted.content?.caption ||
        '';
}

function extractTextInput(m, args = []) {
    return args.join(' ').trim() || getQuotedText(m.quoted);
}

function extractSingleTarget(m, args = []) {
    if (m.quoted?.sender) return m.quoted.sender;
    if (m.mentions?.length) return m.mentions[0];

    const mention = args.join(' ').match(/@(\d+)/);
    if (mention) return `${mention[1]}@s.whatsapp.net`;

    return null;
}

function extractUrls(text = '') {
    return [...new Set(String(text).match(URL_REGEX) || [])];
}

function normalizeJid(jid = '') {
    return String(jid || '').replace(/:\d+@/, '@');
}

module.exports = {
    pickRandom,
    formatUptime,
    getQuotedText,
    extractTextInput,
    extractSingleTarget,
    extractUrls,
    normalizeJid
};
