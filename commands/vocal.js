// commands/vocal.js - Génère un message vocal (text-to-speech)
const fs = require('fs');
const { formatMessage, withNewsletter } = require('../lib/messageStyler');

let voiceGenerator = null;

function getVoiceGenerator() {
    if (!voiceGenerator) {
        voiceGenerator = require('../lib/voiceGenerator');
    }
    return voiceGenerator;
}

module.exports = {
    name: "vocal",
    aliases: ["tts", "speak", "say", "voix"],
    description: "Convertit du texte en message vocal",
    category: "fun",

    async execute(sock, m, args) {
        try {
            let textToConvert = args.join(' ');

            // Essayer d'extraire le texte du message cité
            if (!textToConvert && m.quoted) {
                textToConvert = m.quoted.body || m.quoted.text || '';
            }

            if (!textToConvert) {
                return await sock.sendMessage(m.chat, withNewsletter({
                    text: formatMessage(
                        `*❌ Erreur*\n\n` +
                        `Usage : ${global.config.prefix}vocal <texte>\n` +
                        `ou répondre à un message avec ${global.config.prefix}vocal`,
                        { title: '🎤 VOCAL', status: 'error' }
                    )
                }));
            }

            // Limiter la longueur du texte
            if (textToConvert.length > 500) {
                textToConvert = textToConvert.substring(0, 500);
            }

            // Afficher que la conversion est en cours
            await sock.sendMessage(m.chat, withNewsletter({
                text: formatMessage(
                    `🎤 Génération du vocal en cours...\n\n_Texte: ${textToConvert.substring(0, 50)}${textToConvert.length > 50 ? '...' : ''}_`,
                    { title: '⏳ TRAITEMENT', status: 'info' }
                )
            }));

            const audioPath = await getVoiceGenerator().generateAndSaveVoice(textToConvert, 'fr');

            if (!audioPath || !fs.existsSync(audioPath)) {
                return await sock.sendMessage(m.chat, withNewsletter({
                    text: formatMessage(
                        `*❌ Erreur*\n\nImpossible de générer le vocal. Réessayez.`,
                        { title: '🎤 VOCAL', status: 'error' }
                    )
                }));
            }

            await sock.sendMessage(m.chat, {
                audio: fs.readFileSync(audioPath),
                mimetype: audioPath.endsWith('.ogg') ? 'audio/ogg; codecs=opus' : 'audio/mpeg',
                ptt: true
            }, { quoted: m });

            // Nettoyer le fichier temporaire
            setTimeout(() => {
                if (fs.existsSync(audioPath)) {
                    fs.unlinkSync(audioPath);
                }
            }, 5000);

        } catch (error) {
            console.error('Erreur commande vocal:', error.message);
            await sock.sendMessage(m.chat, withNewsletter({
                text: formatMessage(
                    `*❌ Erreur*\n\n${error.message}`,
                    { title: '🎤 VOCAL', status: 'error' }
                )
            }));
        }
    }
};
