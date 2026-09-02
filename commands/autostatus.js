const fs = require('fs');
const path = require('path');
const isOwnerOrSudo = require('../lib/isOwner');

const channelInfo = {
  contextInfo: {
    forwardingScore: 1,
    isForwarded: true,
    forwardedNewsletterMessageInfo: {
      newsletterJid: '120363409511028124@newsletter',
      newsletterName: 'LUN∆RIS',
      serverMessageId: -1
    }
  }
};

// Path to store auto status configuration
const configPath = path.join(__dirname, '../data/autoStatus.json');

// Initialize config file if it doesn't exist
if (!fs.existsSync(configPath)) {
  fs.writeFileSync(configPath, JSON.stringify({
    enabled: false,
    reactOn: false
  }));
}

async function autoStatusCommand(sock, chatId, msg, args) {
  try {
    const senderId = msg.key.participant || msg.key.remoteJid;
    const isOwner = await isOwnerOrSudo(senderId, sock, chatId);

    if (!msg.key.fromMe && !isOwner) {
      await sock.sendMessage(chatId, {
        text: "\u274C Cette commande ne peut \xEAtre utilis\xE9e que par le propri\xE9taire !",
        ...channelInfo
      });
      return;
    }

    // Read current config
    let config = JSON.parse(fs.readFileSync(configPath));

    // If no arguments, show current status
    if (!args || args.length === 0) {
      const status = config.enabled ? 'enabled' : 'disabled';
      const reactStatus = config.reactOn ? 'enabled' : 'disabled';
      await sock.sendMessage(chatId, {
        text: `🔄 *Paramètres d'état automatiques*\n\n📱 *Vue automatique de l'état :* ${status}\n💫 *Réactions d'état :* ${reactStatus}\n\n*Commandes :*\n.autostatus on - Activer l'affichage automatique de l'état\n.autostatus off - Désactiver l'affichage automatique de l'état\n.autostatus réagir activé - Activer les réactions d'état\n.autostatus réagir désactivé - Désactiver les réactions d'état`,
        ...channelInfo
      });
      return;
    }

    // Handle on/off commands
    const command = args[0].toLowerCase();

    if (command === 'on') {
      config.enabled = true;
      fs.writeFileSync(configPath, JSON.stringify(config));
      await sock.sendMessage(chatId, {
        text: "\u2705 L'affichage automatique de l'\xE9tat a \xE9t\xE9 activ\xE9\xA0! Le bot affichera d\xE9sormais automatiquement tous les statuts des contacts.",
        ...channelInfo
      });
    } else if (command === 'off') {
      config.enabled = false;
      fs.writeFileSync(configPath, JSON.stringify(config));
      await sock.sendMessage(chatId, {
        text: "\u274C L'affichage automatique de l'\xE9tat a \xE9t\xE9 d\xE9sactiv\xE9\xA0! Le bot n\u2019affichera plus automatiquement les statuts.",
        ...channelInfo
      });
    } else if (command === 'react') {
      // Handle react subcommand
      if (!args[1]) {
        await sock.sendMessage(chatId, {
          text: "\u274C Merci de pr\xE9ciser on/off pour les r\xE9actions ! Utilisation\xA0: .autostatus r\xE9agir marche/arr\xEAt",
          ...channelInfo
        });
        return;
      }

      const reactCommand = args[1].toLowerCase();
      if (reactCommand === 'on') {
        config.reactOn = true;
        fs.writeFileSync(configPath, JSON.stringify(config));
        await sock.sendMessage(chatId, {
          text: "\uD83D\uDCAB Les r\xE9actions de statut ont \xE9t\xE9 activ\xE9es\xA0! Le robot r\xE9agira d\xE9sormais aux mises \xE0 jour de statut.",
          ...channelInfo
        });
      } else if (reactCommand === 'off') {
        config.reactOn = false;
        fs.writeFileSync(configPath, JSON.stringify(config));
        await sock.sendMessage(chatId, {
          text: "\u274C Les r\xE9actions de statut ont \xE9t\xE9 d\xE9sactiv\xE9es\xA0! Le bot ne r\xE9agira plus aux mises \xE0 jour de statut.",
          ...channelInfo
        });
      } else {
        await sock.sendMessage(chatId, {
          text: "\u274C Commande de r\xE9action invalide\xA0! Utilisation\xA0: .autostatus r\xE9agir marche/arr\xEAt",
          ...channelInfo
        });
      }
    } else {
      await sock.sendMessage(chatId, {
        text: "\u274C Commande invalide ! Utilisation\xA0: .autostatus on/off - Activer/d\xE9sactiver l'affichage automatique de l'\xE9tat .autostatus r\xE9agir on/off - Activer/d\xE9sactiver les r\xE9actions d'\xE9tat",
        ...channelInfo
      });
    }

  } catch (error) {
    console.error('Error in autostatus command:', error);
    await sock.sendMessage(chatId, {
      text: '❌ Error occurred while managing auto status!\n' + error.message,
      ...channelInfo
    });
  }
}

// Function to check if auto status is enabled
function isAutoStatusEnabled() {
  try {
    const config = JSON.parse(fs.readFileSync(configPath));
    return config.enabled;
  } catch (error) {
    console.error('Error checking auto status config:', error);
    return false;
  }
}

// Function to check if status reactions are enabled
function isStatusReactionEnabled() {
  try {
    const config = JSON.parse(fs.readFileSync(configPath));
    return config.reactOn;
  } catch (error) {
    console.error('Error checking status reaction config:', error);
    return false;
  }
}

// Function to react to status using proper method
async function reactToStatus(sock, statusKey) {
  try {
    if (!isStatusReactionEnabled()) {
      return;
    }

    // Use the proper relayMessage method for status reactions
    await sock.relayMessage(
      'status@broadcast',
      {
        reactionMessage: {
          key: {
            remoteJid: 'status@broadcast',
            id: statusKey.id,
            participant: statusKey.participant || statusKey.remoteJid,
            fromMe: false
          },
          text: '💚'
        }
      },
      {
        messageId: statusKey.id,
        statusJidList: [statusKey.remoteJid, statusKey.participant || statusKey.remoteJid]
      }
    );

    // Removed success log - only keep errors
  } catch (error) {
    console.error('❌ Error reacting to status:', error.message);
  }
}

// Function to handle status updates
async function handleStatusUpdate(sock, status) {
  try {
    if (!isAutoStatusEnabled()) {
      return;
    }

    // Add delay to prevent rate limiting
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Handle status from messages.upsert
    if (status.messages && status.messages.length > 0) {
      const msg = status.messages[0];
      if (msg.key && msg.key.remoteJid === 'status@broadcast') {
        try {
          await sock.readMessages([msg.key]);
          const sender = msg.key.participant || msg.key.remoteJid;

          // React to status if enabled
          await reactToStatus(sock, msg.key);

          // Removed success log - only keep errors
        } catch (err) {
          if (err.message?.includes('rate-overlimit')) {
            console.log('⚠️ Rate limit hit, waiting before retrying...');
            await new Promise((resolve) => setTimeout(resolve, 2000));
            await sock.readMessages([msg.key]);
          } else {
            throw err;
          }
        }
        return;
      }
    }

    // Handle direct status updates
    if (status.key && status.key.remoteJid === 'status@broadcast') {
      try {
        await sock.readMessages([status.key]);
        const sender = status.key.participant || status.key.remoteJid;

        // React to status if enabled
        await reactToStatus(sock, status.key);

        // Removed success log - only keep errors
      } catch (err) {
        if (err.message?.includes('rate-overlimit')) {
          console.log('⚠️ Rate limit hit, waiting before retrying...');
          await new Promise((resolve) => setTimeout(resolve, 2000));
          await sock.readMessages([status.key]);
        } else {
          throw err;
        }
      }
      return;
    }

    // Handle status in reactions
    if (status.reaction && status.reaction.key.remoteJid === 'status@broadcast') {
      try {
        await sock.readMessages([status.reaction.key]);
        const sender = status.reaction.key.participant || status.reaction.key.remoteJid;

        // React to status if enabled
        await reactToStatus(sock, status.reaction.key);

        // Removed success log - only keep errors
      } catch (err) {
        if (err.message?.includes('rate-overlimit')) {
          console.log('⚠️ Rate limit hit, waiting before retrying...');
          await new Promise((resolve) => setTimeout(resolve, 2000));
          await sock.readMessages([status.reaction.key]);
        } else {
          throw err;
        }
      }
      return;
    }

  } catch (error) {
    console.error('❌ Error in auto status view:', error.message);
  }
}

module.exports = {
  autoStatusCommand,
  handleStatusUpdate
};