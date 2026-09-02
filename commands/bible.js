// commands/bible.js - Commande pour afficher des versets bibliques
const axios = require('axios');
const { formatMessage, keyValue } = require('../lib/messageStyler');

module.exports = {
    name: "bible",
    aliases: ["verset", "verse"],
    description: "Affiche un verset biblique aléatoire",

    async execute(sock, m, args) {
        try {
            const url = "https://labs.bible.org/api/?passage=random&type=json";
            const res = await axios.get(url, { timeout: 10000 });

            if (!res.data || !res.data[0]) {
                throw new Error("Aucun verset trouvé.");
            }

            const verse = res.data[0];
            const message = `${keyValue('Livre', verse.bookname)}\n` +
                            `${keyValue('Chapitre', verse.chapter)}\n` +
                            `${keyValue('Verset', verse.verse)}\n` +
                            `${keyValue('Texte', verse.text)}`;

            await sock.sendMessage(m.chat, {
                text: formatMessage(message, { title: '📖 Verset Biblique', frameType: 'shadow' })
            });
        } catch (err) {
            console.error('Erreur Bible:', err.message);
            await sock.sendMessage(m.chat, {
                text: formatMessage("Impossible de récupérer un verset biblique. Veuillez réessayer plus tard.", { title: '❌ Erreur', status: 'error' })
            });
        }
    }
};