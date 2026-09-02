// lib/messageStyler.js - Styles BLUE XMD
const config = require('../config');

const asciiArt = {
    success: '🟢',
    error:   '❌',
    warning: '⚠️',
    info:    'ℹ️',
    wait:    '⏳',

    star:        '✦',
    arrow:       '⭔',
    bullet:      '❐',
    crown:       '♛',
    shield:      '🛡️',
    music:       '🎵',
    divider:     '┈┈┈┈┈┈┈┈┈┈✧',
    dividerDash: '┈┈┈┈┈┈┈┈┈┈✧',
};

const frames = {
    darknode: {
        top: title => `*╔═⟪ ${title} ⟫═╗*`,
        line: line => `*╠❏ ${line || ''}*`,
        bottom: '*╚══════════════════╝*'
    },
    stars: {
        top: title => `┏❐  ⌜ *${title}* ⌟  ❐`,
        line: line => `┃ ${line || ''}`,
        bottom: '┗❐'
    },
    shadow: {
        top: title => `╭─〔 *${title}* 〕`,
        line: line => `│ ${line || ''}`,
        bottom: '╰──────────────'
    },
    minimal: {
        top: title => `*${title}*`,
        line: line => `${line || ''}`,
        bottom: asciiArt.divider
    },
    bold: {
        top: title => `╔═══〔 *${title}* 〕═══╗`,
        line: line => `║ ${line || ''}`,
        bottom: '┗┅┅┄┄⟞⟦𝗟𝗨𝗡∆𝗥𝗜𝗦⟧⟝┄┄┉┉┛'
    },
    rounded: {
        top: title => `╭─❍ *${title}*`,
        line: line => `│ ${line || ''}`,
        bottom: '╰─❍'
    },
    lunaris: {
        top: title => `╔┅┅┄┄⟞⟦${String(title || '').toUpperCase()}⟧⟝┄┄┉┉╗`,
        line: line => `┃ ${line || ''}`,
        bottom: '┗━━━━━━━━━━━━━━━━━━━━━┛'
    },
    single: {
        top: title => `┌─〔 *${title}* 〕`,
        line: line => `│ ${line || ''}`,
        bottom: '└────────────'
    },
    double: {
        top: title => `╔═〔 *${title}* 〕`,
        line: line => `║ ${line || ''}`,
        bottom: '╚════════════'
    }
};

const newsletterContextInfo = {
    forwardingScore: 1,
    isForwarded: true,
    forwardedNewsletterMessageInfo: {
        newsletterJid: '120363409211028124@newsletter',
        newsletterName: config.channelName || config.name || 'BLUE XMD',
        serverMessageId: -1
    }
};

function withNewsletter(message = {}) {
    return {
        ...message,
        contextInfo: {
            ...newsletterContextInfo,
            ...(message.contextInfo || {})
        }
    };
}

function frameText(text, title = '', frameType = config.defaultFrame || 'stars') {
    const frame = frames[frameType] || frames.stars;
    const cleanTitle = clean(title || config.name).toUpperCase();
    const lines = String(text || '').split('\n');
    const formattedLines = lines.map(line => frame.line(line.trimEnd()));

    return `${frame.top(cleanTitle)}\n${formattedLines.join('\n')}\n${frame.bottom}`;
}

function addFooter(message, include = true) {
    if (!include || !config.showInvite) return message;

    const footerLines = [
        `Canal: ${config.channel || 'Non configure'}`,
        `Owner: ${config.owner || 'LUNARIS-CORP'}`
    ];

    return `${message}\n${frameText(footerLines.join('\n'), 'SYSTEM LINK', config.defaultFrame || 'darknode')}`;
}

function formatMessage(content, options = {}) {
    const { 
        title = config.name, 
        includeFooter = false, 
        status = null,
        frameType = config.defaultFrame || 'stars'
    } = options;
    
    let fullContent = String(content || '').trim();
    if (status && asciiArt[status]) {
        fullContent = `${asciiArt[status]} ${content}`;
    }
    
    let finalMessage = frameText(fullContent, title, frameType);
    
    if (includeFooter) {
        finalMessage = addFooter(finalMessage, includeFooter);
    }
    
    return finalMessage;
}

function sectionTitle(text) {
    return `*╔═⟪ ${clean(text).toUpperCase()} ⟫═╗*`;
}

function bulletList(items) {
    return items.map(item => `〉${item}`).join('\n');
}

function commandLine(name, description = '') {
    const command = `${config.prefix}${name}`;
    return description ? `〉${command} ${description}` : `〉${command}`;
}

function keyValue(label, value) {
    return `${label}: ${value}`;
}

function clean(value) {
    return String(value || '')
        .replace(/\s+/g, ' ')
        .trim();
}

module.exports = { 
    frameText, 
    addFooter, 
    newsletterContextInfo,
    withNewsletter,
    asciiArt, 
    formatMessage, 
    sectionTitle,
    bulletList,
    commandLine,
    keyValue
};
