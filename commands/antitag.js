const { setAntitag, getAntitag, removeAntitag } = require('../lib/index');
const isAdmin = require('../lib/isAdmin');

async function handleAntitagCommand(sock, chatId, userMessage, senderId, isSenderAdmin, message) {
  try {
    if (!isSenderAdmin) {
      await sock.sendMessage(chatId, { text: "```Pour les administrateurs de groupe uniquement !```" }, { quoted: message });
      return;
    }

    const prefix = '.';
    const args = userMessage.slice(9).toLowerCase().trim().split(' ');
    const action = args[0];

    if (!action) {
      const usage = `\`\`\`ANTITAG SETUP\n\n${prefix}antitag on\n${prefix}antitag set delete | kick\n${prefix}antitag off\n\`\`\``;
      await sock.sendMessage(chatId, { text: usage }, { quoted: message });
      return;
    }

    switch (action) {
      case 'on':
        const existingConfig = await getAntitag(chatId, 'on');
        if (existingConfig?.enabled) {
          await sock.sendMessage(chatId, { text: "*_Antitag est d\xE9j\xE0 activ\xE9_*" }, { quoted: message });
          return;
        }
        const result = await setAntitag(chatId, 'on', 'delete');
        await sock.sendMessage(chatId, {
          text: result ? '*_Antitag has been turned ON_*' : '*_Failed to turn on Antitag_*'
        }, { quoted: message });
        break;

      case 'off':
        await removeAntitag(chatId, 'on');
        await sock.sendMessage(chatId, { text: "*_Antitag a \xE9t\xE9 d\xE9sactiv\xE9_*" }, { quoted: message });
        break;

      case 'set':
        if (args.length < 2) {
          await sock.sendMessage(chatId, {
            text: `*_Veuillez spécifier une action : ${prefix}antitag set delete | coup_*`
          }, { quoted: message });
          return;
        }
        const setAction = args[1];
        if (!['delete', 'kick'].includes(setAction)) {
          await sock.sendMessage(chatId, {
            text: "*_Action invalide. Choisissez supprimer ou expulser._*"
          }, { quoted: message });
          return;
        }
        const setResult = await setAntitag(chatId, 'on', setAction);
        await sock.sendMessage(chatId, {
          text: setResult ? `*_Antitag action set to ${setAction}_*` : '*_Failed to set Antitag action_*'
        }, { quoted: message });
        break;

      case 'get':
        const status = await getAntitag(chatId, 'on');
        const actionConfig = await getAntitag(chatId, 'on');
        await sock.sendMessage(chatId, {
          text: `*_Configuration Antitag :_*\nStatut : ${status ? 'ON' : 'OFF'}\nAction : ${actionConfig ? actionConfig.action : 'Not set'}`
        }, { quoted: message });
        break;

      default:
        await sock.sendMessage(chatId, { text: `*_Utilisez ${prefix}antitag pour l'utilisation._*` }, { quoted: message });
    }
  } catch (error) {
    console.error('Error in antitag command:', error);
    await sock.sendMessage(chatId, { text: "*_Erreur lors du traitement de la commande antitag_*" }, { quoted: message });
  }
}

async function handleTagDetection(sock, chatId, message, senderId) {
  try {
    const antitagSetting = await getAntitag(chatId, 'on');
    if (!antitagSetting || !antitagSetting.enabled) return;

    // Get mentioned JIDs from contextInfo (proper mentions)
    const mentionedJids = message.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];

    // Extract text from all possible message types
    const messageText =
    message.message?.conversation ||
    message.message?.extendedTextMessage?.text ||
    message.message?.imageMessage?.caption ||
    message.message?.videoMessage?.caption ||
    '';


    // Find all @mentions in text using improved regex
    // Matches: @123456789, @⁨+91 70239 51514⁩, @~.., @217875470114951, etc.
    const textMentions = messageText.match(/@[\d+\s\-()~.]+/g) || [];

    // Also match numeric-only mentions (like @217875470114951)
    const numericMentions = messageText.match(/@\d{10,}/g) || [];

    // Combine all mentions and remove duplicates
    const allMentions = [...new Set([...mentionedJids, ...textMentions, ...numericMentions])];

    // Count unique numeric mentions (bot tagall patterns)
    const uniqueNumericMentions = new Set();
    numericMentions.forEach((mention) => {
      const numMatch = mention.match(/@(\d+)/);
      if (numMatch) uniqueNumericMentions.add(numMatch[1]);
    });

    // Count mentions from mentionedJid array (proper WhatsApp mentions)
    const mentionedJidCount = mentionedJids.length;

    // Count unique numeric mentions found in text (bot tagall pattern)
    const numericMentionCount = uniqueNumericMentions.size;

    // Use the higher count (either proper mentions or text-based mentions)
    // This ensures we catch both standard mentions and bot tagall patterns
    const totalMentions = Math.max(mentionedJidCount, numericMentionCount);

    // Check if it's a group message and has multiple mentions
    if (totalMentions >= 3) {
      // Get group participants to check if it's tagging most/all members
      const groupMetadata = await sock.groupMetadata(chatId);
      const participants = groupMetadata.participants || [];

      // If mentions are more than 50% of group members, consider it as tagall
      const mentionThreshold = Math.ceil(participants.length * 0.5);

      // Also check if there are many numeric mentions in the text (bot tagall pattern)
      // This catches bots that use numeric IDs instead of proper mentions
      const hasManyNumericMentions = numericMentionCount >= 10 ||
      numericMentionCount >= 5 && numericMentionCount >= mentionThreshold;

      // Trigger if: standard mentions exceed threshold OR many numeric mentions detected
      if (totalMentions >= mentionThreshold || hasManyNumericMentions) {

        const action = antitagSetting.action || 'delete';

        if (action === 'delete') {
          // Delete the message
          await sock.sendMessage(chatId, {
            delete: {
              remoteJid: chatId,
              fromMe: false,
              id: message.key.id,
              participant: senderId
            }
          });

          // Send warning
          await sock.sendMessage(chatId, {
            text: `⚠️ *Tagall détecté !*.`
          }, { quoted: message });

        } else if (action === 'kick') {
          // First delete the message
          await sock.sendMessage(chatId, {
            delete: {
              remoteJid: chatId,
              fromMe: false,
              id: message.key.id,
              participant: senderId
            }
          });

          // Then kick the user
          await sock.groupParticipantsUpdate(chatId, [senderId], "remove");

          // Send notification
          const usernames = [`@${senderId.split('@')[0]}`];
          await sock.sendMessage(chatId, {
            text: `🚫 *Antitag détecté !*\n\n${usernames.join(', ')} a été expulsé pour avoir tagué tous les membres.`,
            mentions: [senderId]
          }, { quoted: message });
        }
      }
    }
  } catch (error) {
    console.error('Error in tag detection:', error);
  }
}

module.exports = {
  handleAntitagCommand,
  handleTagDetection
};