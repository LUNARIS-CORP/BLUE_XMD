const fs = require('fs');

const words = ['javascript', 'bot', 'hangman', 'whatsapp', 'nodejs'];
let hangmanGames = {};

function startHangman(sock, chatId) {
  const word = words[Math.floor(Math.random() * words.length)];
  const maskedWord = '_ '.repeat(word.length).trim();

  hangmanGames[chatId] = {
    word,
    maskedWord: maskedWord.split(' '),
    guessedLetters: [],
    wrongGuesses: 0,
    maxWrongGuesses: 6
  };

  sock.sendMessage(chatId, { text: `Le jeu a commencé ! Le mot est : ${maskedWord}` });
}

function guessLetter(sock, chatId, letter) {
  if (!hangmanGames[chatId]) {
    sock.sendMessage(chatId, { text: "Aucun jeu en cours. Commencez une nouvelle partie avec .hangman" });
    return;
  }

  const game = hangmanGames[chatId];
  const { word, guessedLetters, maskedWord, maxWrongGuesses } = game;

  if (guessedLetters.includes(letter)) {
    sock.sendMessage(chatId, { text: `You already guessed "${letter}". Try another letter.` });
    return;
  }

  guessedLetters.push(letter);

  if (word.includes(letter)) {
    for (let i = 0; i < word.length; i++) {
      if (word[i] === letter) {
        maskedWord[i] = letter;
      }
    }
    sock.sendMessage(chatId, { text: `Bonne supposition ! ${maskedWord.join(' ')}` });

    if (!maskedWord.includes('_')) {
      sock.sendMessage(chatId, { text: `Félicitations! Vous avez deviné le mot : ${word}` });
      delete hangmanGames[chatId];
    }
  } else {
    game.wrongGuesses += 1;
    sock.sendMessage(chatId, { text: `Mauvaise supposition ! Il vous reste ${maxWrongGuesses - game.wrongGuesses} essais.` });

    if (game.wrongGuesses >= maxWrongGuesses) {
      sock.sendMessage(chatId, { text: `Jeu terminé! Le mot était : ${word}` });
      delete hangmanGames[chatId];
    }
  }
}

module.exports = { startHangman, guessLetter };