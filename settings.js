const settings = {
  packname: 'BLUE XMD',
  author: 'LUNARIS-CORP',
  botName: 'BLUE XMD',
  botOwner: 'LUNARIS-CORP',
  ownerNumber: process.env.OWNER_NUMBER || '2250500065540',
  giphyApiKey: process.env.GIPHY_API_KEY || '',
  commandMode: "public",
  maxStoreMessages: 20,
  maxRamMb: Number(process.env.BOT_MAX_RAM_MB || 768),
  storeWriteInterval: 10000,
  description: "Bot personnel pour gérer les groupes, automatiser des tâches et répondre en français.",
  version: "3.0.7",
  updateZipUrl: "https://github.com/LUNARIS-CORP/BLUE",
  prefix: ".",
  channelName: "LUNARIS-CORP",
  newsletterJid: process.env.NEWSLETTER_JID || '120363409211028124@newsletter',
  aiAgent: {
    enabled: false,
    provider: process.env.BOT_AI_PROVIDER || process.env.AI_PROVIDER || 'openrouter',
    model: process.env.GROQ_MODEL || process.env.BOT_GROQ_MODEL || 'openai/gpt-oss-20b',
    openRouterModel: process.env.BOT_OPENROUTER_MODEL || process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini',
    memoryMessages: Number(process.env.AI_MEMORY_MESSAGES || 6),
    memoryMinutes: Number(process.env.AI_MEMORY_MINUTES || 30),
    maxOutputTokens: Number(process.env.AI_MAX_OUTPUT_TOKENS || 400),
    temperature: Number(process.env.AI_TEMPERATURE || 0.7),
    replyDelayMs: Number(process.env.AI_REPLY_DELAY_MS || 3000),
    replyDelayRandomMs: Number(process.env.AI_REPLY_DELAY_RANDOM_MS || 4000)
  },
};

module.exports = settings;
