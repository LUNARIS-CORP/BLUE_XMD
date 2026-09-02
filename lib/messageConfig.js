const config = require('../config');

const channelInfo = {
    contextInfo: {
        forwardingScore: 1,
        isForwarded: true,
        forwardedNewsletterMessageInfo: {
            newsletterJid: config.channel || '120363409211028124@newsletter',
            newsletterName: config.channelName || config.name || 'BLUE XMD',
            serverMessageId: -1
        }
    }
};

module.exports = {
    channelInfo: channelInfo
};
