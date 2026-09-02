const fs = require('fs');
const path = require('path');

const settingsPath = path.join(__dirname, '../data/group-settings.json');
let cache = null;

function ensureStoreLoaded() {
    if (cache) return cache;

    const dataDir = path.dirname(settingsPath);
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }

    if (!fs.existsSync(settingsPath)) {
        fs.writeFileSync(settingsPath, '{}');
    }

    try {
        cache = JSON.parse(fs.readFileSync(settingsPath, 'utf8') || '{}');
    } catch {
        cache = {};
    }

    return cache;
}

function saveStore() {
    fs.writeFileSync(settingsPath, JSON.stringify(cache, null, 2));
}

function getGroupSettings(groupId) {
    const store = ensureStoreLoaded();
    return Promise.resolve(store[groupId] || {});
}

function updateGroupSettings(groupId, settings) {
    const store = ensureStoreLoaded();
    store[groupId] = { ...(store[groupId] || {}), ...(settings || {}) };
    saveStore();
    return Promise.resolve(store[groupId]);
}

async function setGroupSetting(groupId, key, value) {
    const settings = await getGroupSettings(groupId);
    settings[key] = value;
    await updateGroupSettings(groupId, settings);
    return settings;
}

module.exports = {
    getGroupSettings,
    updateGroupSettings,
    setGroupSetting
};
