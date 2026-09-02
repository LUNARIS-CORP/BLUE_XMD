const axios = require('axios');

module.exports = async function (sock, chatId) {
  try {
    const apiKey = 'dcd720a6f1914e2d9dba9790c188c08c'; // Replace with your NewsAPI key
    const response = await axios.get(`https://newsapi.org/v2/top-headlines?country=us&apiKey=${apiKey}`);
    const articles = response.data.articles.slice(0, 5); // Get top 5 articles
    let newsMessage = "\uD83D\uDCF0 *Derni\xE8res nouvelles*\xA0:";
    articles.forEach((article, index) => {
      newsMessage += `${index + 1}. *${article.title}*\n${article.description}\n\n`;
    });
    await sock.sendMessage(chatId, { text: newsMessage });
  } catch (error) {
    console.error('Error fetching news:', error);
    await sock.sendMessage(chatId, { text: "D\xE9sol\xE9, je n'ai pas pu r\xE9cup\xE9rer de nouvelles pour le moment." });
  }
};