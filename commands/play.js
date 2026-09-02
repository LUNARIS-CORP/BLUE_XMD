const yts = require('yt-search');
const axios = require('axios');

async function playCommand(sock, chatId, message) {
  try {
    const text = message.message?.conversation || message.message?.extendedTextMessage?.text;
    const searchQuery = text.split(' ').slice(1).join(' ').trim();

    if (!searchQuery) {
      return await sock.sendMessage(chatId, {
        text: "Quelle chanson veux-tu t\xE9l\xE9charger ?"
      });
    }

    // Search for the song
    const { videos } = await yts(searchQuery);
    if (!videos || videos.length === 0) {
      return await sock.sendMessage(chatId, {
        text: "Aucune chanson trouv\xE9e\xA0!"
      });
    }

    // Send loading message
    await sock.sendMessage(chatId, {
      text: "_Veuillez patienter, votre t\xE9l\xE9chargement est en cours_"
    });

    // Get the first video result
    const video = videos[0];
    const urlYt = video.url;

    // Fetch audio data from API
    const response = await axios.get(`https://apis-keith.vercel.app/download/dlmp3?url=${urlYt}`);
    const data = response.data;

    if (!data || !data.status || !data.result || !data.result.downloadUrl) {
      return await sock.sendMessage(chatId, {
        text: "\xC9chec de la r\xE9cup\xE9ration de l'audio \xE0 partir de l'API. Veuillez r\xE9essayer plus tard."
      });
    }

    const audioUrl = data.result.downloadUrl;
    const title = data.result.title;

    // Send the audio
    await sock.sendMessage(chatId, {
      audio: { url: audioUrl },
      mimetype: "audio/mpeg",
      fileName: `${title}.mp3`
    }, { quoted: message });

  } catch (error) {
    console.error('Error in song2 command:', error);
    await sock.sendMessage(chatId, {
      text: "Le t\xE9l\xE9chargement a \xE9chou\xE9. Veuillez r\xE9essayer plus tard."
    });
  }
}

module.exports = playCommand;

/*Powered by lunaris
*Credits to BLUE XMD*`*/