const config = require('../config');
const fs = require('fs');
const path = require('path');
const { withNewsletter } = require('../lib/messageStyler');
const { botName } = require('../settings');

const MENU_WEB_SOURCE = 'https://yun.inc.com';
const MENU_WEB_THUMBNAIL = 'https://files.catbox.moe/eeliot.jpg';
const MENU_SHARED_IMAGE_PATTERN = /^menu-shared-\d+\.(jpg|jpeg|png|webp)$/i;
const MENU_ROTATION_STATE_PATH = path.join(__dirname, '..', 'data', 'menu-rotation.json');
const thumbnailCache = new Map();

module.exports = {
    name: 'menu',
    aliases: ['help', 'aide', 'start'],
    description: 'Affiche le menu principal avec toutes les commandes',

    async execute(sock, m) {
        try {
            console.log('[menu] execute called', { chat: m?.chat, senderName: m?.senderName || m?.sender, key: m?.key && !!m.key.remoteJid });
            const uptimeStr = formatUptime(process.uptime());
            const totalCmds = countCommandFiles();
            const subscription = getMenuSubscription(m);

            const sections = [
                makeSystemHeader({
                    hello: m.senderName || 'Utilisateur',
                    status: 'Online ✅',
                    version: config.version,
                    mode: capitalize(config.mode),
                    owner: config.owner,
                    uptime: uptimeStr,
                    commands: totalCmds,
                    subscription
                }),
                makeSection('🛡️ PROTECTION MENU', [
                    menuItem('antilink', 'protection liens'),
                    menuItem('antitag', 'protection tags'),
                    menuItem('antibadword', 'anti-mots interdits'),
                    menuItem('antidelete', 'anti-suppression'),
                    menuItem('vv', 'view once'),
                    menuItem('viewonce'),
                    maybeMenuItem('3412', '(owner)', subscription),
                    menuItem('ban'),
                    menuItem('unban'),
                    menuItem('mute', 'fermer le groupe'),
                    menuItem('unmute', 'ouvrir le groupe')
                ].filter(Boolean)),
                makeSection('⚠️ WARNING SYSTEM', [
                    menuItem('warn', '@user [raison]'),
                    menuItem('warnings'),
                    menuItem('clearwarns', '@user'),
                    menuItem('warns', 'liste des warns'),
                    rawItem(`auto-kick at ${config.maxWarns} warnings`)
                ]),
                makeSection('🎮 GAMES MENU', [
                    menuItem('eightball', '<question>'),
                    menuItem('8ball', '<question>'),
                    menuItem('ship', '@u1 @u2'),
                    menuItem('truth'),
                    menuItem('dare'),
                    menuItem('ttt'),
                    menuItem('simp'),
                    menuItem('stupid'),
                    menuItem('tictactoe'),
                    menuItem('move', '<case>'),
                    menuItem('surrender'),
                    menuItem('hangman'),
                    menuItem('guess', '<lettre>'),
                    menuItem('trivia'),
                    menuItem('answer', '<réponse>')
                ]),
                makeSection('🛠️ UTILITY MENU', [
                    menuItem('translate'),
                    menuItem('trt'),
                    menuItem('meteo'),
                    menuItem('weather'),
                    menuItem('search'),
                    menuItem('recherche'),
                    menuItem('ddg'),
                    menuItem('url'),
                    menuItem('tourl'),
                    menuItem('admins'),
                    menuItem('staff'),
                    menuItem('jid'),
                    menuItem('infos'),
                    menuItem('groupinfo'),
                    menuItem('groupowner'),
                    menuItem('github'),
                    menuItem('git'),
                    menuItem('repo'),
                    menuItem('bible'),
                    menuItem('news'),
                    menuItem('vocal'),
                    menuItem('tts'),
                    menuItem('say'),
                    menuItem('time'),
                    menuItem('rules'),
                    menuItem('ping'),
                    menuItem('alive')
                ]),
                makeSection('GROUP MENU', [
                    menuItem('welcome'),
                    menuItem('goodbye'),
                    menuItem('kick'),
                    menuItem('promote'),
                    menuItem('demote'),
                    menuItem('delete'),
                    menuItem('hidetag'),
                    menuItem('tag'),
                    menuItem('tagall'),
                    menuItem('tagnotadmin'),
                    menuItem('resetlink'),
                    menuItem('setgdesc'),
                    menuItem('setgname'),
                    menuItem('setgpp'),
                    menuItem('mention'),
                    menuItem('setmention'),
                    menuItem('clear'),
                    menuItem('topmembers')
                ]),
                makeSection('FUN MENU', [
                    menuItem('meme'),
                    menuItem('joke'),
                    menuItem('fact', '[html|js|python|web|cyber|info]'),
                    menuItem('quote'),
                    menuItem('character'),
                    menuItem('truth'),
                    menuItem('dare'),
                    menuItem('compliment'),
                    menuItem('insult'),
                    menuItem('flirt'),
                    menuItem('roseday'),
                    menuItem('goodnight'),
                    menuItem('shayari'),
                    menuItem('poeme'),
                    menuItem('waste'),
                    menuItem('emojimix'),
                    menuItem('emix'),
                    menuItem('heart')
                ]),
                makeSection('CONTROL MENU', [
                    maybeMenuItem('agent', 'on/off', subscription),
                    menuItem('pairing', '<numéro>'),
                    menuItem('pair', '<numéro>'),
                    menuItem('sendmsg', '@user | message (owner)'),
                    menuItem('owner'),
                    menuItem('mode'),
                    menuItem('setprefix'),
                    menuItem('settings'),
                    menuItem('sudo'),
                    menuItem('anticall'),
                    menuItem('pmblocker', 'on/off'),
                    menuItem('areact', 'on/off'),
                    menuItem('autoreact', 'on/off'),
                    menuItem('autoreaction', 'on/off'),
                    menuItem('autoread', 'on/off'),
                    menuItem('autotyping', 'on/off'),
                    menuItem('autostatus react', 'on/off'),
                    menuItem('autostatus view', 'on/off'),
                    menuItem('cleartmp'),
                    menuItem('clearsession'),
                    menuItem('clearsesi'),
                    menuItem('setpp'),
                    menuItem('update'),
                    menuItem('menu'),
                    menuItem('alive'),
                    menuItem('ping')
                ]),
                makeSection('TOOLS MENU', [
                    menuItem('attp'),
                    menuItem('take'),
                    menuItem('steal'),
                    menuItem('translate'),
                    menuItem('pinterest'),
                    menuItem('lyrics'),
                    menuItem('ss'),
                    menuItem('screenshot'),
                    menuItem('blur'),
                    menuItem('removebg'),
                    menuItem('remini'),
                    menuItem('sora'),
                    menuItem('imagine'),
                    menuItem('flux'),
                    menuItem('dalle'),
                    menuItem('url')
                ]),
                makeSection('AI MENU', [
                    menuItem('agent', 'on/off'),
                    menuItem('ai'),
                    menuItem('assistant'),
                    menuItem('gpt'),
                    menuItem('gemini'),
                    menuItem('chatbot')
                ]),
                makeSection('DOWNLOADER MENU', [
                    menuItem('play'),
                    menuItem('song'),
                    menuItem('music'),
                    menuItem('mp3'),
                    menuItem('ytmp3'),
                    menuItem('video'),
                    menuItem('ytmp4'),
                    menuItem('spotify'),
                    menuItem('facebook'),
                    menuItem('fb'),
                    menuItem('instagram'),
                    menuItem('ig'),
                    menuItem('tiktok'),
                    menuItem('tt'),
                    menuItem('igs'),
                    menuItem('igsc'),
                    menuItem('mysic', 'audio BLUE XMD'),
                    menuItem('yun'),
                    menuItem('anime'),
                    menuItem('meteo')
                ]),
                makeSection('PIES MENU', [
                    menuItem('pies'),
                    menuItem('china'),
                    menuItem('indonesia'),
                    menuItem('japan'),
                    menuItem('korea'),
                    menuItem('india'),
                    menuItem('malaysia'),
                    menuItem('thailand')
                ]),
                makeSection('STICKER MENU', [
                    menuItem('sticker'),
                    menuItem('s'),
                    menuItem('simage'),
                    menuItem('crop'),
                    menuItem('stickercrop'),
                    menuItem('stickertelegram'),
                    menuItem('tgsticker'),
                    menuItem('take')
                ]),
                makeSection('TEXT MAKER MENU', [
                    menuItem('metallic'),
                    menuItem('ice'),
                    menuItem('snow'),
                    menuItem('impressive'),
                    menuItem('matrix'),
                    menuItem('light'),
                    menuItem('neon'),
                    menuItem('devil'),
                    menuItem('purple'),
                    menuItem('thunder'),
                    menuItem('leaves'),
                    menuItem('1917'),
                    menuItem('arena'),
                    menuItem('hacker'),
                    menuItem('sand'),
                    menuItem('blackpink'),
                    menuItem('glitch'),
                    menuItem('fire')
                ]),
                makeSection('IMAGE FUN MENU', [
                    menuItem('horny'),
                    menuItem('circle'),
                    menuItem('lgbt'),
                    menuItem('lolice'),
                    menuItem('simpcard'),
                    menuItem('its-so-stupid'),
                    menuItem('tonikawa'),
                    menuItem('namecard'),
                    menuItem('oogway'),
                    menuItem('tweet'),
                    menuItem('ytcomment'),
                    menuItem('comrade'),
                    menuItem('gay'),
                    menuItem('glass'),
                    menuItem('jail'),
                    menuItem('passed'),
                    menuItem('triggered')
                ]),
                makeSection('ANIME MENU', [
                    menuItem('animu'),
                    menuItem('nom'),
                    menuItem('poke'),
                    menuItem('cry'),
                    menuItem('kiss'),
                    menuItem('pat'),
                    menuItem('hug'),
                    menuItem('wink'),
                    menuItem('facepalm'),
                    menuItem('animuquote'),
                    menuItem('loli')
                ])
            ];

            const menuText = sections.join('\n\n');
            const mediaPath = resolveMenuMedia();

            if (mediaPath) {
                try {
                    await sock.sendMessage(m.chat, withNewsletter(buildMenuImageMessage(mediaPath, menuText)));
                } catch (mediaErr) {
                    if (isSendSessionError(mediaErr)) throw mediaErr;
                    console.error('Erreur media menu:', mediaErr.message);
                    await sock.sendMessage(m.chat, withNewsletter({ text: menuText }));
                }
                return;
            }

            await sock.sendMessage(m.chat, withNewsletter({ text: menuText }));
        } catch (err) {
            console.error('Erreur menu:', err);
            if (isSendSessionError(err)) throw err;
            await sock.sendMessage(m.chat, withNewsletter({
                text: makeSection('❌ MENU', [
                    rawItem("Erreur lors de l'affichage du menu.")
                ])
            }));
        }
    }
};

function makeSystemHeader(data) {
    const title = config.name || (require('../settings').botName) || 'LUNARIS';
    return [
        `*╔┅┅┄┄⟞⟦${botName}⟧⟝┄┄┉┉╗*`,
        `*╠❏ Hello: ${data.hello}*`,
        `*╠❏ Status: ${data.status}*`,
        `*╠❏ Accès: ${data.subscription.label}*`,
        `*╠❏ Version: ${data.version}*`,
        `*╠❏ Mode: ${data.mode}*`,
        `*╠❏ Owner: ${data.owner}*`,
        `*╠❏ Commands: ${data.commands}*`,
        `*╠❏ Uptime: ${data.uptime}*`,
        `*╚┅┅┄┄⟞⟦${botName}⟧⟝┄┄┉┉╝*`
    ].join('\n');
}

function makeSection(title, items) {
    return [
        `*╔┅┄⟞⟦${title}⟧⟝┄┉╗*`,
        ...items.map(item => `╠❏ ${item}`),
        '*╚══════════════════╝*'
    ].join('\n');
}

function menuItem(name, description = '') {
    const prefix = '〉';
    const command = `${prefix}${name}`;
    return description ? `${command}  ${description}` : command;
}

function maybeMenuItem(name, description) {
    return menuItem(name, description);
}

function rawItem(text) {
    return `〉${text}`;
}

function getMenuSubscription() {
    return {
        code: 'personal',
        label: 'Perso / sans abonnement'
    };
}

function isSendSessionError(error) {
    const text = String(error?.stack || error?.message || error || '').toLowerCase();
    return error?.data === 406 ||
        text.includes('not-acceptable') ||
        text.includes('assertsessions') ||
        text.includes('bad mac') ||
        text.includes('badmac');
}

function formatUptime(uptimeSeconds) {
    const days = Math.floor(uptimeSeconds / 86400);
    const hours = Math.floor((uptimeSeconds % 86400) / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);
    const seconds = Math.floor(uptimeSeconds % 60);

    if (days > 0) {
        return `${days}d ${hours}h ${minutes}m ${seconds}s`;
    }

    return `${hours}h ${minutes}m ${seconds}s`;
}

function countCommandFiles() {
    try {
        return fs.readdirSync(__dirname).filter(file => file.endsWith('.js')).length;
    } catch {
        return 'N/A';
    }
}

function resolveMenuMedia() {
    const configuredPath = config.menuMediaPath
        ? path.resolve(__dirname, '..', config.menuMediaPath)
        : null;
    const assetsDir = path.join(__dirname, '..', 'assets');
    const sharedDir = path.join(assetsDir, 'menu-shared');
    const sharedDirCandidates = fs.existsSync(sharedDir)
        ? fs.readdirSync(sharedDir)
            .filter(file => /\.(jpg|jpeg|png|webp)$/i.test(file))
            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
            .map(file => path.join(sharedDir, file))
        : [];
    const sharedCandidates = fs.existsSync(assetsDir)
        ? fs.readdirSync(assetsDir)
            .filter(file => MENU_SHARED_IMAGE_PATTERN.test(file))
            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
            .map(file => path.join(assetsDir, file))
        : [];
    const dynamicCandidates = fs.existsSync(assetsDir)
        ? fs.readdirSync(assetsDir)
            .filter(file => /^menu[\w-]*\.(jpg|jpeg|png|webp)$/i.test(file))
            .filter(file => !MENU_SHARED_IMAGE_PATTERN.test(file))
            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
            .map(file => path.join(assetsDir, file))
        : [];

    const fallbackCandidates = [configuredPath].filter(Boolean);

    const preferredExisting = [...new Set([...sharedDirCandidates, ...sharedCandidates])].filter(file => fs.existsSync(file));
    if (preferredExisting.length > 0) {
        return getNextRotatedMedia(preferredExisting);
    }

    const uniqueExisting = [...new Set([...dynamicCandidates, ...fallbackCandidates])]
        .filter(file => fs.existsSync(file));

    if (uniqueExisting.length === 0) return null;
    return getNextRotatedMedia(uniqueExisting);
}

function getNextRotatedMedia(candidates) {
    const files = [...new Set(candidates)].filter(Boolean);
    if (files.length === 0) return null;
    if (files.length === 1) return files[0];

    const previousKey = readMenuRotationState().lastKey;
    const previousIndex = files.findIndex(file => getMediaRotationKey(file) === previousKey);
    const nextIndex = previousIndex >= 0 ? (previousIndex + 1) % files.length : 0;
    const nextFile = files[nextIndex];

    writeMenuRotationState({
        lastKey: getMediaRotationKey(nextFile),
        updatedAt: new Date().toISOString()
    });

    return nextFile;
}

function readMenuRotationState() {
    try {
        return JSON.parse(fs.readFileSync(MENU_ROTATION_STATE_PATH, 'utf8'));
    } catch {
        return {};
    }
}

function writeMenuRotationState(state) {
    try {
        fs.mkdirSync(path.dirname(MENU_ROTATION_STATE_PATH), { recursive: true });
        fs.writeFileSync(MENU_ROTATION_STATE_PATH, JSON.stringify(state, null, 2));
    } catch (err) {
        console.error('Erreur rotation menu:', err.message);
    }
}

function getMediaRotationKey(file) {
    return path.relative(path.join(__dirname, '..'), file);
}

function buildMenuImageMessage(mediaPath, text) {
    return {
        image: { url: mediaPath },
        caption: text,
        contextInfo: {
            isForwarded: true,
            forwardingScore: 999,
            forwardedNewsletterMessageInfo: {
                newsletterJid: config.channel || '120363293817117079@newsletter',
                newsletterName: config.channelName || config.name,
                serverMessageId: 143
            }
        }
    };
}

async function buildMenuPreviewMessage(mediaPath, text) {
    return {
        text,
        contextInfo: {
            externalAdReply: await buildWebPreview(mediaPath)
        }
    };
}

async function buildWebPreview(mediaPath) {
    const thumbnail = getCachedThumbnail(mediaPath || MENU_WEB_THUMBNAIL);
    const isRemoteMedia = /^https?:\/\//i.test(String(mediaPath || ''));

    return {
        title: `${config.name} Menu`,
        body: 'BLUE XMD • Command Center',
        thumbnailUrl: isRemoteMedia ? mediaPath : MENU_WEB_THUMBNAIL,
        thumbnail,
        sourceUrl: MENU_WEB_SOURCE,
        mediaUrl: isRemoteMedia ? mediaPath : MENU_WEB_SOURCE,
        mediaType: 1,
        renderLargerThumbnail: true,
        showAdAttribution: true
    };
}

function getCachedThumbnail(mediaPath) {
    if (!mediaPath) return undefined;
    if (thumbnailCache.has(mediaPath)) return thumbnailCache.get(mediaPath);

    const localPath = resolveLocalMediaPath(mediaPath);
    if (!localPath) return undefined;

    try {
        const thumbnail = fs.readFileSync(localPath);
        thumbnailCache.set(mediaPath, thumbnail);
        return thumbnail;
    } catch (err) {
        console.error('Erreur thumbnail locale menu:', err.message);
        return undefined;
    }
}

function resolveLocalMediaPath(mediaPath) {
    if (!mediaPath || /^https?:\/\//i.test(mediaPath)) return null;
    const absolutePath = path.isAbsolute(mediaPath)
        ? mediaPath
        : path.resolve(__dirname, '..', mediaPath);
    return fs.existsSync(absolutePath) ? absolutePath : null;
}

function capitalize(value = '') {
    const text = String(value || '');
    return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}
