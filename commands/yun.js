// commands/yun.js - Envoie l'audio 𝐘𝐔𝐍∆ depuis assets
const fs = require('fs');
const path = require('path');
const { formatMessage } = require('../lib/messageStyler');

module.exports = {
    name: "mysic",
    aliases: ["yun", "voice", "audioyun", "yv"],
    description: "Envoie l'audio 𝐘𝐔𝐍∆",

    async execute(sock, m) {
        const audioPath = findYunAudio();

        if (!audioPath) {
            return sock.sendMessage(m.chat, {
                text: formatMessage('Audio 𝐘𝐔𝐍∆ introuvable dans assets.', { title: '❌ 𝐘𝐔𝐍∆', status: 'error' })
            });
        }

        try {
            await sock.sendMessage(m.chat, {
                audio: fs.readFileSync(audioPath),
                mimetype: 'audio/mpeg',
                ptt: false
            });
        } catch (err) {
            console.error('Erreur yun audio:', err.message);
            await sock.sendMessage(m.chat, {
                text: formatMessage("Impossible d'envoyer l'audio 𝐘𝐔𝐍∆.", { title: '❌ 𝐘𝐔𝐍∆', status: 'error' })
            });
        }
    }
};

function findYunAudio() {
    const assetsDir = path.join(__dirname, '..', 'assets');
    const candidates = [
        path.join(assetsDir, 'YUN.mp3'),
        path.join(assetsDir, 'YUN .mp3')
    ];

    return candidates.find(filePath => fs.existsSync(filePath)) || '';
}
