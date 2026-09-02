const axios = require('axios');

async function soraCommand(sock, chatId, message) {
  try {
    const rawText = message.message?.conversation?.trim() ||
    message.message?.extendedTextMessage?.text?.trim() ||
    message.message?.imageMessage?.caption?.trim() ||
    message.message?.videoMessage?.caption?.trim() ||
    '';

    // Extract prompt after command keyword or use quoted text
    const used = (rawText || '').split(/\s+/)[0] || '.sora';
    const args = rawText.slice(used.length).trim();
    const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const quotedText = quoted?.conversation || quoted?.extendedTextMessage?.text || '';
    const input = args || quotedText;

    if (!input) {
      await sock.sendMessage(chatId, { text: "Fournissez une invite. Exemple\xA0:\xA0.sora anime girl aux cheveux bleus courts" }, { quoted: message });
      return;
    }

    const apiUrl = `https://okatsu-rolezapiiz.vercel.app/ai/txt2video?text=${encodeURIComponent(input)}`;
    const { data } = await axios.get(apiUrl, { timeout: 60000, headers: { 'user-agent': 'Mozilla/5.0' } });

    const videoUrl = data?.videoUrl || data?.result || data?.data?.videoUrl;
    if (!videoUrl) {
      throw new Error('No videoUrl in API response');
    }

    await sock.sendMessage(chatId, {
      video: { url: videoUrl },
      mimetype: 'video/mp4',
      caption: `Invite : ${input}`
    }, { quoted: message });

  } catch (error) {
    console.error('[SORA] error:', error?.message || error);
    await sock.sendMessage(chatId, { text: "\xC9chec de la g\xE9n\xE9ration de la vid\xE9o. Essayez une autre invite plus tard." }, { quoted: message });
  }
}

module.exports = soraCommand;