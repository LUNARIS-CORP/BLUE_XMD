const axios = require('axios');
const { sleep } = require('../lib/myfunc');

async function pairCommand(sock, chatId, message, q) {
  try {
    if (!q) {
      return await sock.sendMessage(chatId, {
        text: "Veuillez fournir un num\xE9ro WhatsApp valide Exemple\xA0: .paire 91702395XXXX",
        contextInfo: {
          forwardingScore: 1,
          isForwarded: true,
          forwardedNewsletterMessageInfo: {
            newsletterJid: '120363409511028124@newsletter',
            newsletterName: 'LUN∆RIS',
            serverMessageId: -1
          }
        }
      });
    }

    const numbers = q.split(',').
    map((v) => v.replace(/[^0-9]/g, '')).
    filter((v) => v.length > 5 && v.length < 20);

    if (numbers.length === 0) {
      return await sock.sendMessage(chatId, {
        text: "Num\xE9ro invalide\u274C\uFE0F Veuillez utiliser le bon format\xA0!",
        contextInfo: {
          forwardingScore: 1,
          isForwarded: true,
          forwardedNewsletterMessageInfo: {
            newsletterJid: '120363409511028124@newsletter',
            newsletterName: 'LUN∆RIS',
            serverMessageId: -1
          }
        }
      });
    }

    for (const number of numbers) {
      const whatsappID = number + '@s.whatsapp.net';
      const result = await sock.onWhatsApp(whatsappID);

      if (!result[0]?.exists) {
        return await sock.sendMessage(chatId, {
          text: `Ce numéro n'est pas enregistré sur WhatsApp❗️`,
          contextInfo: {
            forwardingScore: 1,
            isForwarded: true,
            forwardedNewsletterMessageInfo: {
              newsletterJid: '120363409511028124@newsletter',
              newsletterName: 'LUN∆RIS',
              serverMessageId: -1
            }
          }
        });
      }

      await sock.sendMessage(chatId, {
        text: "Attendez un instant le code",
        contextInfo: {
          forwardingScore: 1,
          isForwarded: true,
          forwardedNewsletterMessageInfo: {
            newsletterJid: '120363409511028124@newsletter',
            newsletterName: 'LUN∆RIS',
            serverMessageId: -1
          }
        }
      });

      try {
        const response = await axios.get(`https://knight-bot-paircode.onrender.com/code?number=${number}`);

        if (response.data && response.data.code) {
          const code = response.data.code;
          if (code === "Service Unavailable") {
            throw new Error('Service Unavailable');
          }

          await sleep(5000);
          await sock.sendMessage(chatId, {
            text: `Votre code d'appairage : ${code}`,
            contextInfo: {
              forwardingScore: 1,
              isForwarded: true,
              forwardedNewsletterMessageInfo: {
                newsletterJid: '120363409511028124@newsletter',
                newsletterName: 'LUN∆RIS',
                serverMessageId: -1
              }
            }
          });
        } else {
          throw new Error('Invalid response from server');
        }
      } catch (apiError) {
        console.error('API Error:', apiError);
        const errorMessage = apiError.message === 'Service Unavailable' ?
        "Service is currently unavailable. Please try again later." :
        "Failed to generate pairing code. Please try again later.";

        await sock.sendMessage(chatId, {
          text: errorMessage,
          contextInfo: {
            forwardingScore: 1,
            isForwarded: true,
            forwardedNewsletterMessageInfo: {
              newsletterJid: '120363409511028124@newsletter',
              newsletterName: 'LUN∆RIS',
              serverMessageId: -1
            }
          }
        });
      }
    }
  } catch (error) {
    console.error(error);
    await sock.sendMessage(chatId, {
      text: "Une erreur s'est produite. Veuillez r\xE9essayer plus tard.",
      contextInfo: {
        forwardingScore: 1,
        isForwarded: true,
        forwardedNewsletterMessageInfo: {
          newsletterJid: '120363409511028124@newsletter',
          newsletterName: 'LUN∆RIS',
          serverMessageId: -1
        }
      }
    });
  }
}

module.exports = pairCommand;