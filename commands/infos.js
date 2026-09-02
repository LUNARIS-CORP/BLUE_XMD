// commands/infos.js - Informations du groupe ou du chat N9uf_S
const config = require('../config');
const settings = require('../settings');
const { formatMessage, asciiArt, keyValue } = require('../lib/messageStyler');
const { getGroupSettings } = require('../lib/groupSettings');

module.exports = {
    name: "infos",
    aliases: ["info", "chatinfo", "groupinfo"],
    description: "Affiche les informations du groupe ou du chat",

    async execute(sock, m, args) {
        try {
            if (m.isGroup) {
                // ── Infos GROUPE ──────────────────────────────────
                const metadata = await withTimeout(sock.groupMetadata(m.chat), 10000, 'metadata groupe indisponible');
                const participants = metadata.participants || [];
                const totalMembers = participants.length;
                const admins = participants.filter(p => p.admin);
                const members = totalMembers - admins.length;
                const createdAt = metadata.creation
                    ? new Date(metadata.creation * 1000).toLocaleDateString('fr-FR', {
                        day: '2-digit', month: '2-digit', year: 'numeric'
                      })
                    : 'Inconnu';

                // Récupération des settings groupe (antilink, antimarabout...)
                const grpSettings = await getGroupSettings(m.chat);
                const antilinkStatus  = grpSettings.antiLink      ? '🟢 Activé' : '🔴 Désactivé';
                const antimarEnabled = settings.antiMarabout?.enabled !== false && grpSettings.antiMarabout !== false;
                const antimarStatus = antimarEnabled ? '🟢 Activé' : '🔴 Désactivé';

                // Indicateur de restriction
                const restrict = metadata.restrict ? '🔒 Admins seulement' : '🔓 Tous les membres';
                const announce = metadata.announce  ? '📢 Annonces' : '💬 Discussion';

                const txt = [
                    keyValue('Nom', metadata.subject),
                    keyValue('ID', `...${m.chat.slice(-15)}`),
                    keyValue('Créé le', createdAt),
                    keyValue('Type', announce),
                    keyValue('Envoi', restrict),
                    asciiArt.divider,
                    keyValue('Membres', totalMembers),
                    keyValue('Admins', admins.length),
                    keyValue('Simples', members),
                    asciiArt.divider,
                    keyValue('Anti-lien', antilinkStatus),
                    keyValue('Anti-marabout', antimarStatus)
                ].join('\n');

                await sock.sendMessage(m.chat, {
                    text: formatMessage(txt, {
                        title: '📊 INFOS GROUPE',
                        frameType: 'shadow',
                        includeFooter: false
                    })
                });

            } else {
                // ── Infos CHAT PRIVÉ ──────────────────────────────
                const txt = [
                    keyValue('Bot', config.name),
                    keyValue('Version', `v${config.version}`),
                    keyValue('Owner', config.owner),
                    keyValue('Préfixe', `\`${config.prefix}\``),
                    keyValue('Mode', config.mode || 'Public'),
                    asciiArt.divider,
                    keyValue('Ton pseudo', m.senderName),
                    keyValue('Ton num', `+${m.sender.split('@')[0]}`)
                ].join('\n');

                await sock.sendMessage(m.chat, {
                    text: formatMessage(txt, {
                        title: 'ℹ️ INFORMATIONS',
                        frameType: 'shadow',
                        includeFooter: false
                    })
                });
            }

        } catch (err) {
            console.error('Erreur infos:', err);
            await sock.sendMessage(m.chat, {
                text: formatMessage('Impossible de récupérer les informations.', {
                    title: '❌ ERREUR', status: 'error'
                })
            });
        }
    }
};

function withTimeout(promise, timeoutMs, message) {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error(message)), timeoutMs))
    ]);
}
