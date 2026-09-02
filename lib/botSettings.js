const fs = require('fs');
const path = require('path');

const defaultSettingsPath = path.join(__dirname, '../data/bot-settings.json');
const scopedSettingsDir = path.join(__dirname, '../data/bot-settings');
const caches = new Map();

function getSettingsPath(sessionId = getDefaultSessionId()) {
    if (!sessionId || sessionId === 'main') return defaultSettingsPath;
    const safeSessionId = String(sessionId).replace(/[^a-zA-Z0-9_-]/g, '') || 'main';
    return path.join(scopedSettingsDir, `${safeSessionId}.json`);
}

function getDefaultSessionId() {
    const candidates = [
        process.env.BOT_PAIRING_PHONE,
        process.env.BOT_INSTANCE_LABEL,
        process.env.BOT_SESSION_DIR
    ].filter(Boolean);

    for (const candidate of candidates) {
        const phone = String(candidate).replace(/\D/g, '');
        if (phone && phone.length >= 8) return phone;
    }

    const label = String(process.env.BOT_INSTANCE_LABEL || 'main')
        .replace(/^client-/, '')
        .replace(/[^a-zA-Z0-9_-]/g, '')
        .trim();
    return label || 'main';
}

function ensureStoreLoaded(sessionId = getDefaultSessionId()) {
    const settingsPath = getSettingsPath(sessionId);
    if (caches.has(settingsPath)) return caches.get(settingsPath);

    const dataDir = path.dirname(settingsPath);
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }

    if (!fs.existsSync(settingsPath)) {
        fs.writeFileSync(settingsPath, '{}');
    }

    try {
        caches.set(settingsPath, JSON.parse(fs.readFileSync(settingsPath, 'utf8') || '{}'));
    } catch {
        caches.set(settingsPath, {});
    }

    migrateLegacySettings(sessionId);
    return caches.get(settingsPath);
}

function saveStore(sessionId = getDefaultSessionId()) {
    const settingsPath = getSettingsPath(sessionId);
    const store = caches.get(settingsPath) || {};
    fs.writeFileSync(settingsPath, JSON.stringify(store, null, 2));
}

function migrateLegacySettings(sessionId = getDefaultSessionId()) {
    const settingsPath = getSettingsPath(sessionId);
    const cache = caches.get(settingsPath);
    if (!cache || typeof cache !== 'object') return;

    if (cache.aiAgentEnabled === undefined && cache.agentEnabled !== undefined) {
        cache.aiAgentEnabled = cache.agentEnabled;
        saveStore(sessionId);
    }
}

function getAiAgentEnabled(fallback = false, sessionId = getDefaultSessionId()) {
    const store = ensureStoreLoaded(sessionId);
    return store.aiAgentEnabled ?? store.agentEnabled ?? fallback;
}

function getBotSettingsSync(sessionId = getDefaultSessionId()) {
    return ensureStoreLoaded(sessionId);
}

function getBotSettings(sessionId = getDefaultSessionId()) {
    return Promise.resolve(ensureStoreLoaded(sessionId));
}

function updateBotSettings(nextSettings, sessionId = getDefaultSessionId()) {
    const settingsPath = getSettingsPath(sessionId);
    const store = ensureStoreLoaded(sessionId);
    const nextStore = { ...store, ...(nextSettings || {}) };
    caches.set(settingsPath, nextStore);
    saveStore(sessionId);
    return Promise.resolve(nextStore);
}

async function setBotSetting(key, value, sessionId = getDefaultSessionId()) {
    const settings = await getBotSettings(sessionId);
    settings[key] = value;
    await updateBotSettings(settings, sessionId);
    return settings;
}

module.exports = {
    getBotSettingsSync,
    getBotSettings,
    getAiAgentEnabled,
    updateBotSettings,
    setBotSetting,
    getDefaultSessionId,
    getSettingsPath
};
