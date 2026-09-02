const { addWelcome, delWelcome, isWelcomeOn, addGoodbye, delGoodBye, isGoodByeOn } = require('../lib/index');
const { delay } = require('@whiskeysockets/baileys');

async function handleWelcome(sock, chatId, message, match) {
    if (!match) {
        return sock.sendMessage(chatId, {
            text: `📥 *Configuration des messages de bienvenue*\n\n✅ *.welcome on* — Active les messages de bienvenue\n🛠️ *.welcome set Ton message personnalisé* — Définit un message personnalisé\n🚫 *.welcome off* — Désactive les messages de bienvenue\n\n*Variables disponibles :*\n• {user} - Mentions le nouveau membre\n• {group} - Affiche le nom du groupe\n• {description} - Affiche la description du groupe`,
            quoted: message
        });
    }

    const [command, ...args] = match.split(' ');
    const lowerCommand = command.toLowerCase();
    const customMessage = args.join(' ');

    if (lowerCommand === 'on') {
        if (await isWelcomeOn(chatId)) {
            return sock.sendMessage(chatId, { text: '⚠️ Les messages de bienvenue sont déjà activés.', quoted: message });
        }
        await addWelcome(chatId, true, 'Bienvenue {user} dans {group} ! 🎉');
        return sock.sendMessage(chatId, { text: '✅ Les messages de bienvenue sont activés. Utilise *.welcome set [ton message]* pour personnaliser.', quoted: message });
    }

    if (lowerCommand === 'off') {
        if (!(await isWelcomeOn(chatId))) {
            return sock.sendMessage(chatId, { text: '⚠️ Les messages de bienvenue sont déjà désactivés.', quoted: message });
        }
        await delWelcome(chatId);
        return sock.sendMessage(chatId, { text: '✅ Les messages de bienvenue sont désactivés pour ce groupe.', quoted: message });
    }

    if (lowerCommand === 'set') {
        if (!customMessage) {
            return sock.sendMessage(chatId, { text: '⚠️ Donne un message personnalisé. Exemple : *.welcome set Bienvenue dans le groupe !*', quoted: message });
        }
        await addWelcome(chatId, true, customMessage);
        return sock.sendMessage(chatId, { text: '✅ Message de bienvenue personnalisé enregistré.', quoted: message });
    }

    // If no valid command is provided
    return sock.sendMessage(chatId, {
        text: `❌ Commande invalide. Utilise :\n*.welcome on* - Activer\n*.welcome set [message]* - Définir un message personnalisé\n*.welcome off* - Désactiver`,
        quoted: message
    });
}

async function handleGoodbye(sock, chatId, message, match) {
    const lower = match?.toLowerCase();

    if (!match) {
        return sock.sendMessage(chatId, {
            text: `📤 *Configuration des messages d’au revoir*\n\n✅ *.goodbye on* — Active les messages de départ\n🛠️ *.goodbye set Ton message personnalisé* — Définit un message personnalisé\n🚫 *.goodbye off* — Désactive les messages de départ\n\n*Variables disponibles :*\n• {user} - Mentions le membre qui part\n• {group} - Affiche le nom du groupe`,
            quoted: message
        });
    }

    if (lower === 'on') {
        if (await isGoodByeOn(chatId)) {
            return sock.sendMessage(chatId, { text: '⚠️ Les messages d’au revoir sont déjà activés.', quoted: message });
        }
        await addGoodbye(chatId, true, 'Au revoir {user} 👋');
        return sock.sendMessage(chatId, { text: '✅ Les messages d’au revoir sont activés. Utilise *.goodbye set [ton message]* pour personnaliser.', quoted: message });
    }

    if (lower === 'off') {
        if (!(await isGoodByeOn(chatId))) {
            return sock.sendMessage(chatId, { text: '⚠️ Les messages d’au revoir sont déjà désactivés.', quoted: message });
        }
        await delGoodBye(chatId);
        return sock.sendMessage(chatId, { text: '✅ Les messages d’au revoir sont désactivés pour ce groupe.', quoted: message });
    }

    if (lower.startsWith('set ')) {
        const customMessage = match.substring(4);
        if (!customMessage) {
            return sock.sendMessage(chatId, { text: '⚠️ Donne un message personnalisé. Exemple : *.goodbye set À bientôt !*', quoted: message });
        }
        await addGoodbye(chatId, true, customMessage);
        return sock.sendMessage(chatId, { text: '✅ Message d’au revoir personnalisé enregistré.', quoted: message });
    }

    // If no valid command is provided
    return sock.sendMessage(chatId, {
        text: `❌ Commande invalide. Utilise :\n*.goodbye on* - Activer\n*.goodbye set [message]* - Définir un message personnalisé\n*.goodbye off* - Désactiver`,
        quoted: message
    });
}

module.exports = { handleWelcome, handleGoodbye };
// This code handles welcome and goodbye messages in a WhatsApp group using the Baileys library.