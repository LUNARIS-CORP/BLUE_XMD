require('dotenv').config();
const settings = require('./settings');

global.APIs = {
    xteam: 'https://api.xteam.xyz',
    dzx: 'https://api.dhamzxploit.my.id',
    lol: 'https://api.lolhuman.xyz',
    violetics: 'https://violetics.pw',
    neoxr: 'https://api.neoxr.my.id',
    zenzapis: 'https://zenzapis.xyz',
    akuari: 'https://api.akuari.my.id',
    akuari2: 'https://apimu.my.id',
    nrtm: 'https://fg-nrtm.ddns.net',
    bg: 'http://bochil.ddns.net',
    fgmods: 'https://api-fgmods.ddns.net'
};

global.APIKeys = {
    'https://api.xteam.xyz': process.env.XTEAM_API_KEY || '',
    'https://api.lolhuman.xyz': process.env.LOLHUMAN_API_KEY || '',
    'https://api.neoxr.my.id': process.env.NEOXR_API_KEY || '',
    'https://violetics.pw': process.env.VIOLETICS_API_KEY || '',
    'https://zenzapis.xyz': process.env.ZENZAPIS_API_KEY || '',
    'https://api-fgmods.ddns.net': process.env.FGMODS_API_KEY || ''
};

const config = {
    name: settings.botName,
    version: settings.version,
    owner: settings.botOwner,
    ownerNumber: settings.ownerNumber,
    ownerJid: process.env.OWNER_JID || `${settings.ownerNumber}@s.whatsapp.net`,
    ownerLid: process.env.OWNER_LID || '',
    prefix: settings.prefix || '.',
    mode: settings.commandMode || 'public',
    channel: settings.newsletterJid,
    channelName: settings.channelName,
    showInvite: false,
    maxWarns: 3,
    WARN_COUNT: 3,
    APIs: global.APIs,
    APIKeys: global.APIKeys,
    openrouterModel: settings.aiAgent?.openRouterModel,
    openrouterKeys: [...new Set([
        process.env.OPENROUTER_API_KEYS,
        process.env.BOT_OPENROUTER_KEYS
    ]
        .filter(Boolean)
        .join(',')
        .split(',')
        .map(key => key.trim())
        .filter(Boolean))],
    menuMediaPath: 'assets/bot_image.jpg',
    defaultFrame: 'lunaris'
};

global.config = config;

module.exports = config;
