const axios = require('axios');

module.exports = async function (sock, chatId) {
  try {
    const response = await axios.get('https://icanhazdadjoke.com/', {
      headers: { Accept: 'application/json' }
    });
    const joke = response.data.joke;
    await sock.sendMessage(chatId, { text: joke });
  } catch (error) {
    console.error('Error fetching joke:', error);
    await sock.sendMessage(chatId, { text: "D\xE9sol\xE9, je n'ai pas r\xE9ussi \xE0 trouver une blague pour le moment." });
  }
};