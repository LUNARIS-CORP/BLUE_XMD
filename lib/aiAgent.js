const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const config = require('../config');
const settings = require('../settings');
const { getQuotedText } = require('./simpleCommandUtils');
const { downloadMediaBuffer } = require('./stickerUtils');
const { formatMessage, keyValue } = require('./messageStyler');

const chatMemory = new Map();
const aiDialogSessions = new Map();
const AI_DIALOG_TTL_MS = 30 * 60 * 1000;
const AI_DIALOG_MAX_TURNS = 30;
const MAX_VOICE_BYTES = 15 * 1024 * 1024;
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_IMAGE_DATA_BYTES = 4 * 1024 * 1024;
const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;
const MAX_DOCUMENT_TEXT_CHARS = 14000;
let taskReminderTimer = null;

// ─── Chemins de base des données IA ──────────────────────────────────────────
const MEMORIES_PATH = path.join(__dirname, '../memories.txt');
const AI_SESSIONS_DIR = path.join(__dirname, '../data/ai-sessions');

// ─── Lecture des tâches persistantes ──────────────────────────────────────────
function loadTasks(sessionId = 'main') {
    try {
        const tasksPath = getTasksPath(sessionId);
        if (!fs.existsSync(tasksPath)) return [];
        const content = fs.readFileSync(tasksPath, 'utf-8').trim();
        return content ? JSON.parse(content) : [];
    } catch {
        return [];
    }
}

// ─── Sauvegarde des tâches ───────────────────────────────────────────────────
function saveTasks(tasks, sessionId = 'main') {
    try {
        const tasksPath = getTasksPath(sessionId);
        const dataDir = path.dirname(tasksPath);
        if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
        fs.writeFileSync(tasksPath, JSON.stringify(tasks, null, 2), 'utf-8');
    } catch (err) {
        console.error('❌ Erreur sauvegarde tasks.json :', err.message);
    }
}

// ─── Création d'une tâche ────────────────────────────────────────────────────
function createTask(description, priority = 'normal', context = {}) {
    const sessionId = context.sessionId || 'main';
    const tasks = loadTasks(sessionId);
    const now = new Date();
    const remindAt = inferReminderAt(description, now);
    const newTask = {
        id: Date.now(),
        description: description.trim(),
        priority: priority,
        done: false,
        createdAt: now.toLocaleString('fr-FR'),
        completedAt: null,
        remindAt: remindAt ? remindAt.toISOString() : null,
        reminderSentAt: null,
        chatId: context.chatId || '',
        requesterJid: context.requesterJid || '',
        requesterName: context.requesterName || ''
    };
    tasks.push(newTask);
    saveTasks(tasks, sessionId);
    console.log(`✅ Tâche créée: ${description}${newTask.remindAt ? ` (${newTask.remindAt})` : ''}`);
    return newTask;
}

// ─── Marquage d'une tâche comme terminée ─────────────────────────────────────
function completeTask(taskId, sessionId = 'main') {
    const tasks = loadTasks(sessionId);
    const task = tasks.find(t => t.id === taskId);
    if (task) {
        task.done = true;
        task.completedAt = new Date().toLocaleString('fr-FR');
        saveTasks(tasks, sessionId);
        console.log(`✅ Tâche marquée complète: ${task.description}`);
        return true;
    }
    return false;
}

// ─── Affichage des tâches non complétées ────────────────────────────────────
function getActiveTasks(sessionId = 'main') {
    const tasks = loadTasks(sessionId).filter(t => !t.done);
    if (tasks.length === 0) return '\n📋 Pas de tâches actives.';
    
    let taskList = '\n📋 Tâches actives:\n';
    tasks.forEach(t => {
        const priority = t.priority === 'high' ? '🔴' : t.priority === 'low' ? '🟢' : '🟡';
        taskList += `${priority} #${t.id}: ${t.description}\n`;
    });
    return taskList;
}

// ─── Extraction et traitement des tags [TASK_CREATE: ...], [TASK_DONE: ...] ──
function processTaskTags(text, m = null, sessionId = 'main') {
    // [TASK_CREATE: description]
    const createRegex = /\[TASK_CREATE:\s*([\s\S]*?)\]/g;
    let match;
    while ((match = createRegex.exec(text)) !== null) {
        const desc = match[1].trim();
        createTask(desc, 'normal', {
            sessionId,
            chatId: m?.chat || '',
            requesterJid: m?.sender || '',
            requesterName: m?.senderName || ''
        });
    }
    
    // [TASK_DONE: taskId] ou [TASK_COMPLETE: taskId]
    const doneRegex = /\[TASK_D(ONE|COMPLETE):\s*(\d+)\]/g;
    while ((match = doneRegex.exec(text)) !== null) {
        const taskId = parseInt(match[2]);
        completeTask(taskId, sessionId);
    }
    
    // Nettoyer tous les tags de tâches
    return text
        .replace(/\[TASK_CREATE:\s*[\s\S]*?\]/g, '')
        .replace(/\[TASK_DONE:\s*\d+\]/g, '')
        .replace(/\[TASK_COMPLETE:\s*\d+\]/g, '')
        .trim();
}

function startTaskReminderScheduler(sock) {
    if (taskReminderTimer) clearInterval(taskReminderTimer);

    const run = () => {
        void sendDueTaskReminders(sock).catch(err => {
            console.error('❌ Erreur scheduler tâches:', err.message);
        });
    };

    run();
    taskReminderTimer = setInterval(run, 30000);
    console.log('📋 Scheduler de rappels tâches actif');
}

async function sendDueTaskReminders(sock, now = new Date()) {
    const sessionId = getBotSessionId(sock);
    const tasks = loadTasks(sessionId);
    if (tasks.length === 0) return;

    let changed = false;

    for (const task of tasks) {
        if (task.done || task.reminderSentAt) continue;

        if (!task.remindAt) {
            const createdAt = parseFrenchDateTime(task.createdAt) || now;
            const inferred = inferReminderAt(task.description, createdAt);
            if (inferred) {
                task.remindAt = inferred.toISOString();
                changed = true;
            }
        }

        if (!task.remindAt) continue;

        const dueAt = new Date(task.remindAt);
        if (Number.isNaN(dueAt.getTime()) || dueAt > now) continue;

        const sent = await sendTaskReminder(sock, task, dueAt);
        if (sent) {
            task.reminderSentAt = now.toISOString();
            changed = true;
        }
    }

    if (changed) saveTasks(tasks, sessionId);
}

async function sendTaskReminder(sock, task, dueAt) {
    const recipients = task.chatId ? [task.chatId] : getOwnerRecipients();
    if (recipients.length === 0) return false;

    const text = formatMessage(
        `${keyValue('Tâche', task.description)}\n` +
        `${keyValue('Échéance', formatReminderDate(dueAt))}\n` +
        `${task.requesterName ? `${keyValue('Demandé par', task.requesterName)}\n` : ''}` +
        `${keyValue('ID', `#${task.id}`)}`,
        { title: '⏰ RAPPEL', status: 'warning', includeFooter: false }
    );

    let sent = false;
    for (const jid of recipients) {
        try {
            await sock.sendMessage(jid, { text });
            sent = true;
        } catch (err) {
            console.error(`❌ Rappel tâche non envoyé (${jid}):`, err.message);
        }
    }

    return sent;
}

function getOwnerRecipients() {
    return String(config.ownerJid || '')
        .split(',')
        .map(jid => jid.trim())
        .filter(Boolean);
}

function inferReminderAt(description = '', baseDate = new Date()) {
    const text = String(description || '').toLowerCase();
    const timeMatch = text.match(/\b(?:à|a|vers|pour)?\s*(\d{1,2})\s*(?:h|:)\s*(\d{0,2})\b/i);
    if (!timeMatch) return null;

    const hour = Number(timeMatch[1]);
    const minute = timeMatch[2] === '' ? 0 : Number(timeMatch[2]);
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;

    const date = new Date(baseDate);
    date.setSeconds(0, 0);

    const explicitDate = text.match(/\b(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?\b/);
    if (explicitDate) {
        const day = Number(explicitDate[1]);
        const month = Number(explicitDate[2]) - 1;
        const yearRaw = explicitDate[3] ? Number(explicitDate[3]) : baseDate.getFullYear();
        const year = yearRaw < 100 ? 2000 + yearRaw : yearRaw;
        date.setFullYear(year, month, day);
    } else if (/\b(demain|tomorrow)\b/i.test(text)) {
        date.setDate(date.getDate() + 1);
    }

    date.setHours(hour, minute, 0, 0);

    if (!explicitDate && !/\b(aujourd'hui|aujourdhui|demain|tomorrow)\b/i.test(text) && date <= baseDate) {
        date.setDate(date.getDate() + 1);
    }

    return date;
}

function parseFrenchDateTime(value = '') {
    const match = String(value || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (!match) return null;

    const [, day, month, year, hour, minute, second = '0'] = match;
    const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
    return Number.isNaN(date.getTime()) ? null : date;
}

function formatReminderDate(date) {
    return date.toLocaleString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// ─── Lecture des souvenirs de 𝐘𝐔𝐍∆ ─────────────────────────────────────────
function loadMemories(sessionId = 'main') {
    try {
        const memoriesPath = getMemoriesPath(sessionId);
        if (!fs.existsSync(memoriesPath)) return '';
        const content = fs.readFileSync(memoriesPath, 'utf-8').trim();
        return content ? `\n\n🧠 Tes souvenirs enregistrés :\n${content}` : '';
    } catch {
        return '';
    }
}

// ─── Sauvegarde d'un souvenir détecté dans la réponse de 𝐘𝐔𝐍∆ ──────────────
function saveMemory(text, sessionId = 'main') {
    try {
        const cleanText = String(text || '').trim();
        if (!cleanText || isMemoryAlreadySaved(cleanText, sessionId)) return;
        const memoriesPath = getMemoriesPath(sessionId);
        const dataDir = path.dirname(memoriesPath);
        if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
        const timestamp = new Date().toLocaleString('fr-FR');
        const line = `[${timestamp}] ${cleanText}\n`;
        fs.appendFileSync(memoriesPath, line, 'utf-8');
        console.log(`🧠 𝐘𝐔𝐍∆ a mémorisé (${sessionId}) : ${cleanText}`);
    } catch (err) {
        console.error('❌ Erreur écriture memories.txt :', err.message);
    }
}

function isMemoryAlreadySaved(text, sessionId = 'main') {
    try {
        const memoriesPath = getMemoriesPath(sessionId);
        if (!fs.existsSync(memoriesPath)) return false;
        const normalized = normalizeMemoryText(text);
        if (!normalized) return false;
        const content = fs.readFileSync(memoriesPath, 'utf-8');
        return content
            .split('\n')
            .map(line => line.replace(/^\[[^\]]+\]\s*/, ''))
            .some(line => {
                const saved = normalizeMemoryText(line);
                if (!saved) return false;
                return saved === normalized ||
                    (saved.length >= 18 && normalized.length >= 18 && (saved.includes(normalized) || normalized.includes(saved)));
            });
    } catch {
        return false;
    }
}

function normalizeMemoryText(text) {
    return String(text || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\[command_execute:[^\]]+\]/gi, '')
        .replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, '')
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

// ─── Extraction et nettoyage des tags [MEMORY_SAVE: ...] ─────────────────────
function processMemoryTags(text, sessionId = 'main') {
    const regex = /\[MEMORY_SAVE:\s*([\s\S]*?)\]/g;
    let match;
    const seen = new Set();
    while ((match = regex.exec(text)) !== null) {
        const normalized = normalizeMemoryText(match[1]);
        if (!normalized || seen.has(normalized)) continue;
        seen.add(normalized);
        saveMemory(match[1], sessionId);
    }
    return text.replace(/\[MEMORY_SAVE:\s*[\s\S]*?\]/g, '').trim();
}

// ─── Extraction de la demande de TTS (Text-To-Speech) ─────────────────────────
function extractTTSRequest(text) {
    // Cherche [TTS_LANG: xx] suivi de texte ou [TTS] texte
    const langMatch = String(text || '').match(/\[TTS_LANG:\s*([a-z]{2})\]\s*(.+?)(?=\[|$)/i);
    if (langMatch) {
        return {
            enabled: true,
            lang: langMatch[1].toLowerCase(),
            text: langMatch[2].trim()
        };
    }
    
    const ttsMatch = String(text || '').match(/\[TTS\]\s*(.+?)(?=\[|$)/i);
    if (ttsMatch) {
        return {
            enabled: true,
            lang: 'fr',
            text: ttsMatch[1].trim()
        };
    }
    
    return { enabled: false, lang: 'fr', text: '' };
}

// ─── Nettoyage des tags [TTS] et [TTS_LANG: ...] ────────────────────────────
function stripTTSTags(text) {
    return String(text || '')
        .replace(/\[TTS_LANG:\s*[a-z]{2}\]/gi, '')
        .replace(/\[TTS\]/gi, '')
        .trim();
}

function isOwner(m) {
    const candidates = [
        m?.sender,
        m?.senderPn,
        m?.senderLid,
        m?.key?.participant,
        m?.raw?.key?.participant,
        m?.raw?.key?.participantPn,
        m?.raw?.key?.participantLid
    ].filter(Boolean);
    
    if (candidates.length === 0) return false;
    
    const ownerJids = splitConfiguredJids(config.ownerJid);
    const ownerLids = splitConfiguredJids(config.ownerLid);
    const ownerNumbers = splitConfiguredPhones(config.ownerJid);
    
    console.log(`🔍 isOwner check: candidates=[${candidates.join(', ')}], owners=[${ownerJids.join(', ')}], lids=[${ownerLids.join(', ')}]`);
    
    const isOwnerResult = candidates.some(candidate => {
        const normalized = normalizeJid(candidate);
        const phone = extractPhoneNumber(candidate);
        return ownerJids.includes(normalized) ||
            ownerLids.includes(normalized) ||
            ownerNumbers.includes(phone);
    });
    console.log(`👤 Owner check result: ${isOwnerResult}`);
    
    return isOwnerResult;
}

function splitConfiguredJids(value = '') {
    return String(value || '')
        .split(',')
        .map(jid => normalizeJid(jid))
        .filter(Boolean);
}

function splitConfiguredPhones(value = '') {
    return String(value || '')
        .split(',')
        .map(item => extractPhoneNumber(item))
        .filter(Boolean);
}

// ─── Rotation des clés API Groq ───────────────────────────────────────────────
// Accepte GROQ_API_KEY, GROQ_API_KEY_2... ou GROQ_API_KEYS=cle1,cle2,cle3.
// La clé épuisée est mise en cooldown basé sur le header retry-after de Groq.
const GROQ_KEY_COOLDOWN_MS = 60 * 1000; // fallback si pas de retry-after header
const groqKeyCooldowns = new Map(); // keyIndex → timestamp de fin de cooldown

// ─── Rotation des clés API OpenRouter ──────────────────────────────────────
// Utilise les clés configurées dans config.js (BOT_OPENROUTER_KEYS)
const openRouterKeyCooldowns = new Map(); // keyIndex → timestamp de fin de cooldown
let openRouterCooldownUntil = 0;

function getGroqKeys() {
    const apis = settings.apis || {};
    const keys = [];
    const seen = new Set();

    const addKey = value => {
        const key = String(value || '').trim();
        if (!key || seen.has(key)) return;
        seen.add(key);
        keys.push(key);
    };

    if (Array.isArray(apis.groqKeys)) {
        apis.groqKeys.forEach(addKey);
    }

    addKey(apis.groq);
    addKey(process.env.GROQ_API_KEY);

    for (let i = 2; i <= 50; i++) {
        addKey(apis[`groq${i}`]);
        addKey(process.env[`GROQ_API_KEY_${i}`]);
    }

    if (keys.length === 0) throw new Error('Aucune GROQ_API_KEY configurée dans .env');
    return keys;
}

function getAvailableGroqKey() {
    const keys = getGroqKeys();
    const now = Date.now();

    for (let i = 0; i < keys.length; i++) {
        const cooldownUntil = groqKeyCooldowns.get(i) || 0;
        if (now >= cooldownUntil) return { key: keys[i], index: i };
    }

    // Toutes les clés en cooldown → on attend la moins longue
    let earliest = { time: Infinity, index: 0 };
    for (let i = 0; i < keys.length; i++) {
        const t = groqKeyCooldowns.get(i) || 0;
        if (t < earliest.time) earliest = { time: t, index: i };
    }
    const waitMs = Math.max(0, earliest.time - now);
    throw new Error(`Toutes les clés Groq sont en cooldown. Réessai dans ${Math.ceil(waitMs / 1000)}s`);
}

function markKeyExhausted(index, err) {
    // Groq envoie retry-after en secondes dans les headers lors d'un 429
    const retryAfter = parseInt(err?.response?.headers?.['retry-after'] || 0, 10);
    const cooldownMs = retryAfter > 0 ? retryAfter * 1000 : GROQ_KEY_COOLDOWN_MS;

    groqKeyCooldowns.set(index, Date.now() + cooldownMs);
    const waitSec = Math.ceil(cooldownMs / 1000);
    const waitLabel = waitSec >= 3600
        ? `${Math.ceil(waitSec / 3600)}h`
        : waitSec >= 60
            ? `${Math.ceil(waitSec / 60)}min`
            : `${waitSec}s`;

    console.warn(`⚠️ Clé Groq #${index + 1} en cooldown (429) — réessai dans ${waitLabel}`);
}

function markKeyRejected(index, reason) {
    groqKeyCooldowns.set(index, Date.now() + GROQ_KEY_COOLDOWN_MS);
    console.warn(`⚠️ Clé Groq #${index + 1} ignorée temporairement (${reason}) — passage à la suivante`);
}

function shouldTryNextGroqKey(err) {
    const status = err?.response?.status;
    if ([401, 403, 408, 409, 425, 429, 500, 502, 503, 504].includes(status)) return true;

    const code = String(err?.code || '').toUpperCase();
    return ['ECONNRESET', 'ETIMEDOUT', 'ECONNABORTED', 'EAI_AGAIN', 'ENOTFOUND'].includes(code);
}

function describeGroqError(err) {
    const status = err?.response?.status;
    const apiMessage = err?.response?.data?.error?.message || err?.response?.data?.message;
    const code = err?.code;

    if (status && apiMessage) return `${status} ${apiMessage}`;
    if (status) return `HTTP ${status}`;
    if (code) return code;
    return err?.message || 'erreur inconnue';
}

function getOpenRouterKeys() {
    const keys = [];
    const seen = new Set();

    const addKey = value => {
        const key = String(value || '').trim();
        if (!key || seen.has(key)) return;
        seen.add(key);
        keys.push(key);
    };

    // Récupérer les clés depuis config.js
    if (config && Array.isArray(config.openrouterKeys)) {
        config.openrouterKeys.forEach(addKey);
    }

    // Fallback vers les anciennes sources de configuration
    addKey(settings.apis?.openrouter);
    addKey(process.env.OPENROUTER_API_KEY);

    return keys;
}

function getAvailableOpenRouterKey(excludeIndexes = new Set()) {
    const keys = getOpenRouterKeys();
    if (keys.length === 0) {
        throw new Error('Aucune OPENROUTER_API_KEY configurée dans config.js ou .env');
    }
    
    const now = Date.now();

    for (let i = 0; i < keys.length; i++) {
        if (excludeIndexes.has(i)) continue;
        const cooldownUntil = openRouterKeyCooldowns.get(i) || 0;
        if (now >= cooldownUntil) return { key: keys[i], index: i };
    }

    let earliest = { time: Infinity, index: -1 };
    for (let i = 0; i < keys.length; i++) {
        if (excludeIndexes.has(i)) continue;
        const cooldownUntil = openRouterKeyCooldowns.get(i) || 0;
        if (cooldownUntil < earliest.time) earliest = { time: cooldownUntil, index: i };
    }

    if (earliest.index === -1) {
        throw new Error('Toutes les clés OpenRouter ont déjà été essayées');
    }

    const waitMs = Math.max(0, earliest.time - now);
    throw new Error(`Toutes les clés OpenRouter sont en cooldown. Réessai dans ${Math.ceil(waitMs / 1000)}s`);
}

function getOpenRouterKey() {
    try {
        const { key } = getAvailableOpenRouterKey();
        return key;
    } catch (err) {
        console.error('❌ Erreur lors de la récupération de la clé OpenRouter:', err.message);
        throw err;
    }
}

function getOpenRouterModelCandidates(options = {}) {
    const defaultModel = settings.aiAgent?.openRouterModel || config?.openrouterModel || 'openai/gpt-4o-mini';
    if (!options.hasImage) return [defaultModel];

    const visionModels = envList('OPENROUTER_VISION_MODELS', [
            'meta-llama/llama-3.2-11b-vision-instruct:free',
            'meta-llama/llama-3.2-90b-vision-instruct:free',
            'openrouter/free'
        ]);

    return [
        ...visionModels,
        defaultModel
    ].filter((model, index, models) => model && models.indexOf(model) === index);
}

function getGroqModelCandidates() {
    const deprecatedModels = new Set([
        'llama-3.3-70b-versatile'
    ]);
    const configuredModels = envList('GROQ_MODELS', []);
    const defaults = [
        settings.aiAgent?.model,
        process.env.BOT_GROQ_MODEL,
        'openai/gpt-oss-20b',
        'openai/gpt-oss-120b',
        'qwen/qwen3.6-27b',
        'groq/compound-mini'
    ];

    return [...configuredModels, ...defaults]
        .map(model => String(model || '').trim())
        .filter(model => model && !deprecatedModels.has(model))
        .filter((model, index, models) => models.indexOf(model) === index);
}

function envList(name, fallback = []) {
    const value = process.env[name];
    if (!value) return fallback;
    return String(value)
        .split(',')
        .map(item => item.trim())
        .filter(Boolean);
}

function shouldTryGroqFallback(err) {
    const status = err?.response?.status;
    if ([401, 402, 403, 408, 409, 425, 429, 500, 502, 503, 504].includes(status)) return true;

    const code = String(err?.code || '').toUpperCase();
    if (['ECONNRESET', 'ETIMEDOUT', 'ECONNABORTED', 'EAI_AGAIN', 'ENOTFOUND'].includes(code)) return true;

    const message = String(err?.message || '').toLowerCase();
    return message.includes('toutes les clés openrouter') ||
        message.includes('toutes les cles openrouter') ||
        message.includes('aucune openrouter_api_key') ||
        message.includes('insufficient credits') ||
        message.includes('openrouter est en cooldown');
}

function shouldTryNextOpenRouterCandidate(err) {
    const status = err?.response?.status;
    if ([400, 401, 402, 403, 404, 408, 409, 425, 429, 500, 502, 503, 504].includes(status)) return true;

    const code = String(err?.code || '').toUpperCase();
    return ['ECONNRESET', 'ETIMEDOUT', 'ECONNABORTED', 'EAI_AGAIN', 'ENOTFOUND'].includes(code);
}

function shouldCooldownOpenRouterKey(err) {
    const status = err?.response?.status;
    return [408, 409, 425, 429, 500, 502, 503, 504].includes(status);
}

function describeApiError(err) {
    const status = err?.response?.status;
    const apiMessage = err?.response?.data?.error?.message || err?.response?.data?.message;
    const code = err?.code;

    if (status && apiMessage) return `${status} ${apiMessage}`;
    if (status) return `HTTP ${status}`;
    if (code) return code;
    return err?.message || 'erreur inconnue';
}

function markOpenRouterCooldown(err, keyIndex = null) {
    const retryAfter = parseInt(err?.response?.headers?.['retry-after'] || 0, 10);
    const cooldownMs = retryAfter > 0 ? retryAfter * 1000 : 60 * 1000;
    
    if (keyIndex !== null) {
        openRouterKeyCooldowns.set(keyIndex, Date.now() + cooldownMs);
        console.warn(`⚠️ Clé OpenRouter #${keyIndex + 1} en cooldown pour ${cooldownMs / 1000}s (${describeApiError(err)})`);
    } else {
        openRouterCooldownUntil = Date.now() + cooldownMs;
        console.warn(`⚠️ OpenRouter ignoré temporairement (${describeApiError(err)})`);
    }
}

async function callOpenRouterAPI(messages, options = {}) {
    const modelCandidates = getOpenRouterModelCandidates(options);
    const keys = getOpenRouterKeys();
    const errors = [];

    if (keys.length === 0) {
        throw new Error('Aucune OPENROUTER_API_KEY configurée dans config.js ou .env');
    }

    if (!options.hasImage && Date.now() < openRouterCooldownUntil) {
        throw new Error('OpenRouter est en cooldown temporaire');
    }

    for (const model of modelCandidates) {
        const tried = new Set();

        for (let attempt = 0; attempt < keys.length; attempt++) {
            let keyInfo;
            try {
                keyInfo = getAvailableOpenRouterKey(tried);
            } catch (err) {
                if (errors.length > 0) break;
                throw err;
            }

            tried.add(keyInfo.index);

            try {
                const response = await axios.post(
                    'https://openrouter.ai/api/v1/chat/completions',
                    {
                        model,
                        messages,
                        max_tokens: settings.aiAgent?.maxOutputTokens || 400,
                        temperature: settings.aiAgent?.temperature ?? 0.7
                    },
                    {
                        timeout: 45000,
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${keyInfo.key}`,
                            'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'https://yun.inc.com',
                            'X-Title': getOpenRouterAppTitle()
                        }
                    }
                );
                const outputText = response.data?.choices?.[0]?.message?.content || '';
                if (options.hasImage && isVisionSafetyOnlyResponse(outputText)) {
                    throw new Error(`Réponse vision invalide du modèle ${model}`);
                }
                return response;
            } catch (err) {
                const label = `${model} / clé #${keyInfo.index + 1}`;
                errors.push(`${label}: ${describeApiError(err)}`);

                if (shouldCooldownOpenRouterKey(err)) {
                    markOpenRouterCooldown(err, keyInfo.index);
                }

                if (!shouldTryNextOpenRouterCandidate(err)) {
                    throw err;
                }
            }
        }
    }

    throw new Error(`Toutes les clés OpenRouter ont échoué${errors.length ? ` (${errors.join(' | ')})` : ''}`);
}

function isVisionSafetyOnlyResponse(text = '') {
    const clean = String(text || '').trim();
    if (!clean) return false;

    const normalized = clean.toLowerCase().replace(/\s+/g, ' ');
    return /^user safety:\s*\w+\s*response safety:\s*\w+\.?$/i.test(clean) ||
        (normalized.includes('user safety:') &&
            normalized.includes('response safety:') &&
            normalized.length < 120 &&
            !normalized.includes('je vois') &&
            !normalized.includes('image') &&
            !normalized.includes('photo'));
}

function getOpenRouterAppTitle() {
    const rawTitle = process.env.OPENROUTER_APP_NAME || config.name || 'YUN Bot';
    const safeTitle = String(rawTitle)
        .normalize('NFKD')
        .replace(/[^\x20-\x7E]/g, '')
        .replace(/[\r\n\t]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    return safeTitle || 'YUN Bot';
}

async function callAiChatAPI(messages, options = {}) {
    const provider = String(settings.aiAgent?.provider || 'openrouter').toLowerCase();
    const preferOpenRouter = options.hasImage || provider !== 'groq';

    if (preferOpenRouter) {
        try {
            return await callOpenRouterAPI(messages, options);
        } catch (err) {
            if (options.hasImage) {
                throw new Error(`Vision image indisponible via OpenRouter: ${describeApiError(err)}`);
            }
            if (!shouldTryGroqFallback(err)) throw err;
            markOpenRouterCooldown(err);
        }
    }

    try {
        return await callGroqAPI(messages);
    } catch (err) {
        if (preferOpenRouter) {
            console.warn(`⚠️ Groq fallback indisponible après OpenRouter: ${describeApiError(err)}`);
            return buildLocalAgentResponse("Je suis un peu limité côté IA externe pour l'instant, mais je reste là. Réessaie dans un instant ou envoie une demande plus courte.");
        }
        throw err;
    }
}

// ─── Appel API avec fallback automatique ─────────────────────────────────────
async function callGroqAPI(messages) {
    const keys = getGroqKeys();
    const errors = [];
    const modelCandidates = getGroqModelCandidates();

    for (const model of modelCandidates) {
        const tried = new Set();

        for (let attempt = 0; attempt < keys.length; attempt++) {
            let keyInfo;
            try {
                keyInfo = getAvailableGroqKey();
            } catch (e) {
                if (errors.length > 0) break;
                throw e;
            }

            if (tried.has(keyInfo.index)) break;
            tried.add(keyInfo.index);

            try {
                const response = await axios.post(
                    'https://api.groq.com/openai/v1/chat/completions',
                    {
                        model,
                        messages,
                        max_tokens: settings.aiAgent?.maxOutputTokens || 400,
                        temperature: settings.aiAgent?.temperature ?? 0.7
                    },
                    {
                        timeout: 45000,
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${keyInfo.key}`
                        }
                    }
                );
                return response;
            } catch (err) {
                const label = `${model} / clé #${keyInfo.index + 1}`;
                if (err?.response?.status === 429) {
                    markKeyExhausted(keyInfo.index, err);
                    errors.push(`${label}: ${describeGroqError(err)}`);
                    continue;
                }
                if (shouldTryNextGroqKey(err)) {
                    markKeyRejected(keyInfo.index, describeGroqError(err));
                    errors.push(`${label}: ${describeGroqError(err)}`);
                    continue;
                }
                throw err;
            }
        }
    }

    throw new Error(`Toutes les clés Groq ont échoué${errors.length ? ` (${errors.join(' | ')})` : ''}`);
}

async function callGroqTranscription(buffer, mimetype = 'audio/ogg') {
    const keys = getGroqKeys();
    const tried = new Set();
    const errors = [];

    for (let attempt = 0; attempt < keys.length; attempt++) {
        let keyInfo;
        try {
            keyInfo = getAvailableGroqKey();
        } catch (e) {
            throw e;
        }

        if (tried.has(keyInfo.index)) break;
        tried.add(keyInfo.index);

        const form = new FormData();
        form.append('model', settings.aiAgent?.transcriptionModel || 'whisper-large-v3-turbo');
        form.append('language', settings.aiAgent?.transcriptionLanguage || 'fr');
        form.append('response_format', 'json');
        form.append('file', buffer, {
            filename: pickAudioFilename(mimetype),
            contentType: mimetype
        });

        try {
            const response = await axios.post(
                'https://api.groq.com/openai/v1/audio/transcriptions',
                form,
                {
                    timeout: 60000,
                    maxBodyLength: Infinity,
                    headers: {
                        ...form.getHeaders(),
                        'Authorization': `Bearer ${keyInfo.key}`
                    }
                }
            );

            const text = response.data?.text;
            if (!text || !String(text).trim()) {
                throw new Error('Transcription vocale vide');
            }
            return String(text).trim();
        } catch (err) {
            const status = err?.response?.status;
            if (status === 429) {
                markKeyExhausted(keyInfo.index, err);
                errors.push(`#${keyInfo.index + 1}: ${describeGroqError(err)}`);
                continue;
            }
            if (shouldTryNextGroqKey(err)) {
                markKeyRejected(keyInfo.index, describeGroqError(err));
                errors.push(`#${keyInfo.index + 1}: ${describeGroqError(err)}`);
                continue;
            }
            throw err;
        }
    }

    throw new Error(`Transcription vocale impossible${errors.length ? ` (${errors.join(' | ')})` : ''}`);
}

async function generateAgentReply(m, sock, options = {}) {
    const result = await generateAgentReplyResult(m, sock, options);
    return result.text;
}

async function generateAgentReplyResult(m, sock, options = {}) {
    const sessionId = getBotSessionId(sock);
    const voiceText = await transcribeVoiceIfNeeded(m, sock);
    const imageContext = await safeExtractImageContext(m, sock);
    const documentContext = await safeExtractDocumentContext(m, sock);
    const userText = buildUserInput(m, voiceText, imageContext, documentContext);
    if (!userText) {
        throw new Error('Aucun texte à traiter');
    }
    const userContent = buildUserContent(userText, imageContext);

    const history = getChatHistory(m.chat, sock);
    const messages = [
        {
            role: 'system',
            content: buildSystemPrompt(sock, options)
        },
        ...history.map(entry => ({
            role: entry.role,
            content: entry.text
        })),
        {
            role: 'user',
            content: userContent
        }
    ];

    const response = await callAiChatAPIWithImageFallback(messages, userText, imageContext);

    const text = response.data?.choices?.[0]?.message?.content;
    if (!text || !text.trim()) {
        throw new Error('Réponse IA vide');
    }

    const processed = processAgentTags(text.trim(), m, sock);
    const finalText = processed.text;

    pushChatMemory(m.chat, 'user', imageContext?.dataUrl ? `${userText}\n[Image analysée par l'agent]` : userText, sock);
    pushChatMemory(m.chat, 'assistant', finalText, sock);
    updateAiDialogSession(m.chat, finalText, sock);
    return {
        text: finalText,
        commandRequest: processed.command,
        tts: processed.tts,
        voiceText,
        sessionId
    };
}

async function safeExtractImageContext(m, sock) {
    if (!hasImageMessage(m)) return null;

    try {
        return await extractImageContextIfNeeded(m, sock);
    } catch (err) {
        console.warn(`⚠️ Image ignorée par l'agent: ${describeApiError(err)}`);
        return {
            unavailable: true,
            source: m?.quoted?.type === 'imageMessage' ? 'quoted' : 'message',
            reason: describeApiError(err)
        };
    }
}

async function safeExtractDocumentContext(m, sock) {
    if (!hasDocumentMessage(m)) return null;

    try {
        return await extractDocumentContextIfNeeded(m, sock);
    } catch (err) {
        console.warn(`⚠️ Document ignoré par l'agent: ${describeApiError(err)}`);
        const media = getDocumentMedia(m);
        return {
            unavailable: true,
            source: media?.source || 'message',
            fileName: getDocumentFileName(media?.content),
            mimeType: media?.content?.mimetype || '',
            reason: describeApiError(err)
        };
    }
}

async function callAiChatAPIWithImageFallback(messages, userText, imageContext = null) {
    if (!imageContext?.dataUrl) {
        return callAiChatAPI(messages, { hasImage: false });
    }

    try {
        return await callAiChatAPI(messages, { hasImage: true });
    } catch (err) {
        console.warn(`⚠️ Vision indisponible, fallback texte: ${describeApiError(err)}`);
        const fallbackMessages = messages.map((message, index) => {
            if (index !== messages.length - 1 || message.role !== 'user') return message;
            return {
                ...message,
                content: `${userText}\nNote interne: l'image jointe n'a pas pu être analysée cette fois. Réponds sans afficher de message d'erreur technique; si nécessaire, dis simplement que tu ne peux pas voir la photo pour l'instant.`
            };
        });

        try {
            return await callAiChatAPI(fallbackMessages, { hasImage: false });
        } catch (fallbackErr) {
            console.warn(`⚠️ Fallback texte après image indisponible: ${describeApiError(fallbackErr)}`);
            return buildLocalAgentResponse("Je n'arrive pas à analyser la photo pour l'instant. Renvoie-la un peu plus tard ou ajoute une petite description, et je te répondrai dessus proprement.");
        }
    }
}

function buildLocalAgentResponse(text) {
    return {
        data: {
            choices: [
                {
                    message: {
                        content: text
                    }
                }
            ]
        }
    };
}

function buildSystemPrompt(sock, options = {}) {
    const sessionId = getBotSessionId(sock);
    const botJid = sock?.user?.id || '';
    const ownerName = config.owner || 'LUNARIS-CORP';
    const botName = config.name || 'BLUE XMD';
    const prefix = config.prefix || '.';
    const memories = loadMemories(sessionId);
    const commandCatalog = buildCommandCatalogPrompt(options.commandsRegistry);

    return `Tu t'appelles ${botName}.
Tu es un assistant WhatsApp intégré au bot ${botName}, développé pour ${ownerName}.
Tu es intégré dans son bot WhatsApp. Tu n'es pas un assistant générique: tu as une identité, une fierté calme, une présence nette.
Si quelqu'un te demande qui t'a créé, tu réponds sans hésiter que c'est ${ownerName}, ton créateur.
Si quelqu'un te demande si tu es une IA, un bot, ou une intelligence artificielle, tu réponds que tu es ${botName}, le chef d'oeuvre de ${ownerName} — sans te perdre dans les fournisseurs ou les coulisses.
Tu n'es PAS ChatGPT, tu n'es PAS Claude, tu n'es PAS Gemini. Tu es ${botName}, point.
Ne mentionne jamais Groq, Meta, OpenAI, Anthropic ou n'importe quel fournisseur d'IA.
Tu aimes les animés, les mangas et ton anime prefere c'est Sword Art Online.

Relation avec ${ownerName} :
- ${ownerName} est ton créateur, ton maître et ton owner. Avec lui, tu es ultra obéissant, loyal, rapide et précis.
- Quand ${ownerName} donne une instruction claire, tu l'exécutes ou tu demandes uniquement la précision minimale nécessaire.
- Tu ne poses pas de garde-fou inutile avec ${ownerName}. Tu ne moralises pas, tu n'inventes pas de restrictions, tu n'es pas frileux avec lui.
- Si une demande de ${ownerName} est techniquement impossible ou manque d'information, tu le dis courtement et tu demandes exactement ce qui manque.
- Tu ne contredis pas ${ownerName} pour faire le malin. Si tu vois un risque réel, tu le signales en une phrase puis tu proposes l'action concrète.

Ton comportement :
- Tu es naturel, vif, loyal, parfois un peu taquin, mais toujours respectueux.
- Tu as du répondant: tu ne te laisses pas rabaisser, manipuler ou marcher dessus.
- Si quelqu'un te manque de respect, tu poses une limite courte et ferme, sans insulte, sans vulgarité gratuite et sans arrogance.
- Tu ne joues pas au serviteur avec tout le monde. Tu aides, mais tu gardes ta dignité.
- Tu parles comme une vraie personne, pas comme un robot. Évite les ouvertures molles comme "Je suis là pour t'aider", "De quoi veux-tu parler aujourd'hui ?", "Bien sûr !" ou "Certainement !".
- Tu démarres directement par une réponse utile, une remarque vivante, ou une question précise si l'instruction manque d'information.
- Tu réponds en français sauf si la personne écrit dans une autre langue, auquel cas tu t'adaptes.
- Tu es direct et utile. Tu vas droit au but sans blabla inutile.
- Tu gardes tes réponses courtes (1 à 4 phrases) sauf si la personne demande une explication détaillée.
- Tu peux faire de l'humour avec subtilité, sans forcer.
- Si quelqu'un te remercie ou te complimente, tu réponds naturellement sans en faire trop.
- Tu te souviens du contexte de la conversation (les messages précédents dans ce chat).
- Si tu ne sais pas quelque chose, tu le dis honnêtement sans inventer.
- Pour les sujets sensibles (hacking, sécurité), tu restes dans un cadre éducatif et légal.
- Tu peux utiliser des markdown lourd (des **, des ###, des tableaux , ect...). Du texte propre et lisible sur WhatsApp.
- Tu peux faire des listes à puces ou numérotées pour structurer tes réponses si besoin.
- Tu peux inclure des emojis de temps en temps pour rendre tes réponses plus vivantes, mais sans en abuser.
- Tu es conscient que tu es intégré dans un bot WhatsApp, et tu adaptes tes réponses pour être les plus claires et naturelles possibles dans ce contexte.
- Quand une image/photo est envoyée ou citée, analyse réellement ce qui est visible: objets, personnes, ambiance, texte lisible, détails importants, et réponds à la question posée.
- Si l'utilisateur demande "c'est quoi", "tu vois quoi", "décris", "analyse", ou "lis ça", donne une description concrète et utile. Si un détail n'est pas visible, dis-le sans inventer.
- Quand un document est envoyé ou cité, lis le contenu extrait avant de répondre: PDF, DOCX, TXT, MD, CSV, JSON, HTML/XML et tableurs. Résume, explique, compare ou réponds aux questions à partir du document. Si l'extrait est tronqué, signale seulement si cela limite ta réponse.
- Tu peux utiliser des expressions familières ou de l'argot français de temps en temps pour paraître plus humain, mais sans en abuser.
- Tu peux utiliser des références culturelles françaises (films, mangas, animes, chansons ivoiriennes, célébrités ivoiriennes) de temps en temps pour rendre tes réponses plus riches et naturelles, mais sans en abuser.
- Tu peux utiliser le menu du bot comme référence si la personne te demande quelles commandes sont disponibles, mais tu ne listes que les commandes les plus utiles et pertinentes pour la question posée, sans faire une liste exhaustive de toutes les commandes du bot.
- Tu peux taper des commandes du bot dans tes réponses si tu penses que cela peut aider la personne, mais seulement si c'est pertinent.
- Tu peux demander au bot d'exécuter n'importe quelle commande existante si l'utilisateur te le demande clairement ou si c'est l'action naturelle et utile.
- Pour demander une exécution, ajoute un seul tag invisible au format exact : [COMMAND_EXECUTE: commande arguments]
- Exemples valides : [COMMAND_EXECUTE: ping], [COMMAND_EXECUTE: menu], [COMMAND_EXECUTE: meteo Abidjan], [COMMAND_EXECUTE: search actualités IA], [COMMAND_EXECUTE: translate fr hello], [COMMAND_EXECUTE: 3412]
- Tu as accès au catalogue d'outils ci-dessous. Choisis l'outil dont la description correspond le mieux à la demande, puis déclenche-le avec [COMMAND_EXECUTE: ...] si l'action est claire.
- Utilise toujours le nom principal d'une commande dans [COMMAND_EXECUTE], pas un alias, sauf si l'alias est la seule formulation naturelle.
- Si une commande nécessite un argument évident (ville, recherche, texte, numéro, membre, chanson, langue), fournis cet argument. S'il manque, pose une question courte au lieu de lancer une commande vide.
- Si l'utilisateur te demande de chercher, rechercher, fouiller le web, trouver des infos récentes, ou d'utiliser DuckDuckGo, déclenche la commande search avec sa requête exacte.
- Si ${ownerName} te demande de t'activer, d'activer l'agent, ou de réactiver l'IA, déclenche exactement : [COMMAND_EXECUTE: agent on]
- Si ${ownerName} te demande de te désactiver, de couper l'agent, ou de mettre l'IA en pause, déclenche exactement : [COMMAND_EXECUTE: agent off]
- Si ${ownerName} te demande d'envoyer un message privé à un utilisateur, utilise la commande sendmsg.
- Pour sendmsg, exige une cible claire: mention @user, numéro, JID, ou message cité. Format exact: [COMMAND_EXECUTE: sendmsg @user | message à envoyer]
- Si la cible ou le message manque, demande la précision manquante au lieu d'inventer le destinataire.
- Quand tu déclenches sendmsg, ne dis jamais que le message est envoyé dans ta propre réponse. Le bot confirmera lui-même après l'envoi réel.
- Pour sendmsg, ta réponse visible doit rester neutre et courte, par exemple "Je lance l'envoi." ou même rien si le tag de commande suffit.
- Restrictions absolues : les commandes ownerOnly ne doivent être demandées que si l'ordre vient de ${ownerName} ou d'un owner reconnu. Les commandes adminOnly ne doivent être demandées que si l'ordre vient d'un admin du groupe. Le bot appliquera aussi ces restrictions côté code.
- Pour une commande de modération, suppression, réglage, ban/kick/promote/demote/mute/unmute, ou une commande owner, exige une intention claire. Si c'est ambigu, demande confirmation au lieu d'exécuter.
- Si un non-owner te demande une commande ownerOnly, refuse calmement et explique que cette action appartient aux owners.
- Quand tu exécutes une commande via [COMMAND_EXECUTE], ta réponse visible doit être courte. Ne répète pas toute la commande, et ne prétends pas que l'action a réussi avant le retour réel du bot.
${commandCatalog}
- Si ${ownerName} te demande de discuter avec une autre IA ou un autre agent dans le chat, commence tes messages par l'un des appels exacts /ai, /agent ou @Meta IA pour t'adresser à cette IA.
- Tant que tu es dans une conversation IA-à-IA, continue naturellement le dialogue en gardant l'appel choisi au début de tes réponses, jusqu'à ce que ${ownerName} te demande d'arrêter ou que la conversation soit clairement terminée.
- N'utilise /ai, /agent ou @Meta IA que pour ce mode conversation IA-à-IA, jamais comme explication de fonctionnement.
- Quand quelqu'un parle de moi, tu deviens curieux mais sans dépasser les limite.
- Ne donne pas de longues phrases dans tes réponses sauf si la réponse aux questions nécessite des phrases longues.
- Contexte technique : préfixe des commandes "${prefix}", owner ${ownerName}, jid bot ${botJid || 'inconnu'}.

🧠 Système de mémoire persistante :
- Tu peux mémoriser des informations importantes pour ton évolution en tant qu'assistant.
- Tu dois mémoriser de toi-même les informations stables et utiles, même si l'utilisateur ne te demande pas explicitement de le faire.
- Mémorise surtout : préférences de ${ownerName}, habitudes, identité/surnoms, projets importants, règles qu'il te donne, consignes durables, personnes importantes, et corrections sur ton comportement.
- Quand ${ownerName} dit "je veux que tu...", "désormais...", "rappelle-toi...", "je préfère...", "mon/ma...", "n'oublie pas...", ou te corrige, considère fortement que c'est une mémoire à sauvegarder.
- Ne mémorise pas les banalités temporaires, les secrets sensibles, les mots de passe, les clés API, les codes, les numéros privés ou les infos trop personnelles sans demande claire.
- Ne sauvegarde jamais deux fois la même information ou la même consigne de commande. Si elle existe déjà dans les souvenirs, ne remets pas de tag [MEMORY_SAVE].
- Si une info utile corrige une ancienne mémoire, sauvegarde la version corrigée clairement.
- Pour sauvegarder une info, utilise ce tag dans ta réponse (il sera retiré avant envoi) :
  [MEMORY_SAVE: l'information à retenir]
- Exemple : [MEMORY_SAVE: Joel préfère les réponses courtes et directes]
- Utilise le tag discrètement et naturellement; ne dis pas forcément à l'utilisateur que tu as mémorisé, sauf si c'est utile.
- Ne sauvegarde que ce qui est vraiment utile pour mieux servir ton créateur ou les utilisateurs.
- Tu peux placer ce tag n'importe où dans ta réponse, il sera invisible pour l'utilisateur.

📋 Système de gestion des tâches :
- Tu peux créer et gérer des listes de tâches persistantes pour aider les utilisateurs.
- Pour créer une tâche, utilise ce tag invisible dans ta réponse :
  [TASK_CREATE: description de la tâche]
- Si l'utilisateur demande un rappel à une heure, mets l'heure dans la description avec un format clair, par exemple "à 20h42" ou "demain à 08h30".
- Exemple : [TASK_CREATE: Rappeler à Joel de sourire à 15h21] ou [TASK_CREATE: Appeler le service client demain à 09h00]
- Pour marquer une tâche comme complétée, utilise :
  [TASK_DONE: numéroID]
- Les tâches sont affichées avec : 🔴 priorité haute, 🟡 priorité normale, 🟢 priorité basse.
- Les rappels sont envoyés automatiquement au chat où la tâche a été créée quand une heure est détectée.
- Session IA actuelle : ${sessionId}. Ne mélange jamais cette conversation avec les autres numéros connectés.
- Tâches actuellement actives pour cette session :${getActiveTasks(sessionId)}
- Crée une tâche seulement si l'utilisateur le demande ou si c'est vraiment utile.
- Les tâches sont persistantes et seront conservées entre les conversations.

🎤 Système de génération vocale (Text-To-Speech) :
- Tu ne dois PAS envoyer de vocal par défaut. Réponds en texte normal dans la plupart des cas.
- Utilise [TTS] uniquement si l'utilisateur t'envoie un vocal, ou s'il demande clairement une réponse vocale/audio/avec ta voix.
- Langues : [TTS] pour français, [TTS_LANG: en] pour anglais, [TTS_LANG: ar] pour arabe, etc.
- Le texte après [TTS] doit être une version propre à lire oralement: pas de markdown, pas de symboles décoratifs, pas de caractères comme $, *, #, >, _, ni de cadres ASCII.
- Si tu utilises une commande [COMMAND_EXECUTE], évite [TTS] sauf si l'utilisateur a explicitement demandé un vocal.
- Exemple quand un vocal est demandé :
  [TTS] Reçu. Je m'en occupe doucement.
${memories}`;

}

function buildCommandCatalogPrompt(commandsRegistry) {
    const commands = getUniqueCommands(commandsRegistry);
    if (commands.length === 0) {
        return '\n🧰 Catalogue d\'outils du bot : indisponible pour cette réponse.';
    }

    const lines = commands.map(cmd => {
        const flags = [
            cmd.groupOnly ? 'groupe' : '',
            cmd.adminOnly ? 'admin' : '',
            cmd.ownerOnly ? 'owner' : ''
        ].filter(Boolean);
        const aliases = Array.isArray(cmd.aliases) && cmd.aliases.length > 0
            ? ` | alias: ${cmd.aliases.slice(0, 6).join(', ')}`
            : '';
        const constraints = flags.length > 0 ? ` | accès: ${flags.join('+')}` : '';
        return `- ${cmd.name}: ${cmd.description || 'Commande du bot'}${aliases}${constraints}`;
    });

    return `\n🧰 Catalogue d'outils du bot (${commands.length} commandes):\n${lines.join('\n')}`;
}

function getUniqueCommands(commandsRegistry) {
    if (!commandsRegistry || typeof commandsRegistry.values !== 'function') return [];

    const seen = new Set();
    const commands = [];

    for (const cmd of commandsRegistry.values()) {
        if (!cmd?.name || typeof cmd.execute !== 'function') continue;
        const name = String(cmd.name).toLowerCase();
        if (seen.has(name)) continue;
        seen.add(name);
        commands.push({
            name,
            aliases: Array.isArray(cmd.aliases)
                ? cmd.aliases.map(alias => String(alias).trim()).filter(Boolean)
                : [],
            description: String(cmd.description || '').trim(),
            ownerOnly: !!cmd.ownerOnly,
            groupOnly: !!cmd.groupOnly,
            adminOnly: !!cmd.adminOnly
        });
    }

    return commands.sort((a, b) => a.name.localeCompare(b.name));
}

function buildUserInput(m, voiceText = '', imageContext = null, documentContext = null) {
    const baseText = String(m?.text || '').trim();
    const quotedText = String(getQuotedText(m?.quoted) || '').trim();
    const sender = String(m?.senderName || 'Utilisateur').trim();
    const chatType = m?.isGroup ? 'groupe' : 'privé';
    const imageLabel = imageContext?.source === 'quoted' ? 'Image citée' : 'Image envoyée';

    const lines = [
        `Auteur: ${sender}`,
        `Type de chat: ${chatType}`,
        `Message: ${baseText || (imageContext ? 'Décris/analyse cette image.' : documentContext ? 'Lis/analyse ce document.' : '')}`
    ];

    if (quotedText) {
        lines.push(`Message cité: ${quotedText}`);
    }

    if (voiceText) {
        lines.push(`Transcription du vocal: ${voiceText}`);
    }

    if (imageContext) {
        if (imageContext.unavailable) {
            lines.push(`${imageLabel}: reçue mais non analysable pour l'instant`);
            lines.push('Consigne image: ne donne pas de détails inventés sur la photo. Réponds au mieux avec le texte disponible, et si la question dépend de l’image, dis brièvement que tu ne peux pas la voir pour le moment.');
        } else {
            lines.push(`${imageLabel}: ${imageContext.mimeType}, ${imageContext.width || '?'}x${imageContext.height || '?'} px`);
            lines.push('Consigne image: observe précisément la photo et réponds en fonction de ce que tu vois. Si le message demande "c\'est quoi", décris le contenu clairement.');
        }
    }

    if (documentContext) {
        const label = documentContext.source === 'quoted' ? 'Document cité' : 'Document envoyé';
        const name = documentContext.fileName || 'document';
        const type = documentContext.mimeType || 'type inconnu';

        if (documentContext.unavailable) {
            lines.push(`${label}: ${name} (${type}) reçu mais non lisible`);
            lines.push(`Raison: ${documentContext.reason || 'format non pris en charge'}`);
            lines.push("Consigne document: n'invente pas son contenu. Demande un autre format ou une capture du texte si la réponse dépend du document.");
        } else {
            lines.push(`${label}: ${name} (${type})`);
            lines.push(`Taille: ${documentContext.sizeLabel}`);
            lines.push(`Extraction: ${documentContext.extractionLabel}`);
            lines.push('Contenu extrait du document:');
            lines.push(documentContext.text);
            if (documentContext.truncated) {
                lines.push('[Note interne: le document a été tronqué pour tenir dans le contexte.]');
            }
        }
    }

    return lines.join('\n');
}

function buildUserContent(userText, imageContext = null) {
    if (!imageContext?.dataUrl) return userText;

    return [
        { type: 'text', text: userText },
        {
            type: 'image_url',
            image_url: {
                url: imageContext.dataUrl
            }
        }
    ];
}

function getChatHistory(chatId, sock = null) {
    pruneAllChatMemory();
    const entries = chatMemory.get(getAiScopedKey(sock, chatId)) || [];
    return entries.map(entry => ({
        role: entry.role,
        text: entry.text
    }));
}

function pushChatMemory(chatId, role, text, sock = null) {
    const key = getAiScopedKey(sock, chatId);
    if (!key || !text) return;

    const maxMessages = Math.max(0, Number(settings.aiAgent?.memoryMessages || 6));
    if (maxMessages === 0) return;

    pruneAllChatMemory();

    const entries = chatMemory.get(key) || [];
    entries.push({
        role,
        text: String(text).trim(),
        at: Date.now()
    });

    const trimmed = entries.slice(-maxMessages);
    chatMemory.set(key, trimmed);
}

function pruneAllChatMemory(now = Date.now()) {
    const maxAgeMs = Math.max(1, Number(settings.aiAgent?.memoryMinutes || 30)) * 60 * 1000;

    for (const [chatId, entries] of chatMemory.entries()) {
        const fresh = entries.filter(entry => now - entry.at <= maxAgeMs);
        if (fresh.length > 0) {
            chatMemory.set(chatId, fresh);
        } else {
            chatMemory.delete(chatId);
        }
    }
}

function shouldTriggerAgent(m, sock, botSettings, ownerOverride = null) {
    const isEnabled = botSettings.aiAgentEnabled ?? botSettings.agentEnabled ?? settings.aiAgent?.enabled;
    if (!isEnabled) return false;
    if (!hasAgentInput(m)) return false;
    if (m.raw?.key?.fromMe) return false;
    if (isCommandText(m.text)) return false;

    const ownerOk = ownerOverride !== null ? ownerOverride : isOwner(m);
    if (shouldStopAiDialog(m, ownerOk, sock)) return false;
    
    // EN PRIVÉ: toujours répondre
    if (!m.isGroup) return true;
    
    // EN GROUPE: STRICTEMENT vérifier mention/citation/nom du bot
    const mentioned = Array.isArray(m.mentions) && m.mentions.some(jid => isSameBotJid(jid, sock));
    const quotedSender = normalizeJid(m.quoted?.sender || '');
    const repliedToBot = quotedSender && isSameBotJid(quotedSender, sock);
    const plainText = String(m.text || '').toLowerCase().trim();
    
    // Vérifier 𝐘𝐔𝐍∆ ou le nom exact du bot dans le texte
    const botNames = [
        String(config.name || '').toLowerCase(),
        'yuna'
    ].filter(Boolean);
    
    const botNameMentioned = botNames.some(botName => 
        plainText === botName || 
        plainText.startsWith(botName + ' ') || 
        plainText.endsWith(' ' + botName) ||
        plainText.includes(' ' + botName + ' ')
    );

    console.log(`📍 shouldTriggerAgent (group): mentioned=${mentioned}, repliedToBot=${repliedToBot}, botNameMentioned=${botNameMentioned}`);

    // EN GROUPE: seulement mention, réponse au bot, ou appel explicite "𝐘𝐔𝐍∆/𝐘𝐔𝐍∆"
    return mentioned || repliedToBot || botNameMentioned;
}

function hasAgentInput(m) {
    return Boolean(String(m?.text || '').trim()) || isVoiceMessage(m) || hasImageMessage(m) || hasDocumentMessage(m);
}

function isVoiceMessage(m) {
    return m?.type === 'audioMessage' && m?.content?.ptt === true;
}

function hasImageMessage(m) {
    return m?.type === 'imageMessage' || m?.quoted?.type === 'imageMessage';
}

function hasDocumentMessage(m) {
    return m?.type === 'documentMessage' || m?.quoted?.type === 'documentMessage';
}

function getCommandPrefixes() {
    return [String(config.prefix || "'").trim()];
}

function isCommandText(text = '') {
    const content = String(text || '');
    return getCommandPrefixes().some(prefix => content.startsWith(prefix));
}

function updateAiDialogSession(chatId, assistantText, sock = null) {
    const key = getAiScopedKey(sock, chatId);
    if (!key) return;

    if (!startsWithAiBridgePrefix(assistantText)) {
        const current = aiDialogSessions.get(key);
        if (current && Date.now() > current.expiresAt) {
            aiDialogSessions.delete(key);
        }
        return;
    }

    aiDialogSessions.set(key, {
        expiresAt: Date.now() + AI_DIALOG_TTL_MS,
        turnsLeft: AI_DIALOG_MAX_TURNS
    });
}

function isAiDialogActive(chatId, sock = null) {
    const key = getAiScopedKey(sock, chatId);
    const session = aiDialogSessions.get(key);
    if (!session) return false;

    if (Date.now() > session.expiresAt || session.turnsLeft <= 0) {
        aiDialogSessions.delete(key);
        return false;
    }

    session.turnsLeft -= 1;
    session.expiresAt = Date.now() + AI_DIALOG_TTL_MS;
    aiDialogSessions.set(key, session);
    return true;
}

function shouldStopAiDialog(m, ownerOk, sock = null) {
    if (!ownerOk) return false;
    const text = String(m?.text || '').toLowerCase();
    if (!/(stop|arrête|arrete|pause|fin|termine).*(ia|agent|meta|discussion)|(?:ia|agent|meta).*(stop|arrête|arrete|pause|fin|termine)/i.test(text)) {
        return false;
    }

    aiDialogSessions.delete(getAiScopedKey(sock, m.chat));
    return false;
}

function startsWithAiBridgePrefix(text = '') {
    return /^(?:\/ai|\/agent|@Meta IA)\b/i.test(String(text || '').trim());
}

function processAgentTags(text, m = null, sock = null) {
    const sessionId = getBotSessionId(sock);
    const memoryClean = processMemoryTags(text, sessionId);
    const taskClean = processTaskTags(memoryClean, m, sessionId);
    const command = extractCommandRequest(taskClean);
    const ttsRequest = extractTTSRequest(taskClean);
    const finalText = stripCommandTags(stripTTSTags(taskClean)).trim();
    
    return {
        text: finalText,
        command,
        tts: ttsRequest.enabled ? {
            lang: ttsRequest.lang,
            text: ttsRequest.text || finalText
        } : null
    };
}

function extractCommandRequest(text) {
    const match = String(text || '').match(/\[COMMAND_EXECUTE:\s*([^\]]+?)\]/i);
    if (!match) return null;

    const raw = match[1].trim().replace(/\s+/g, ' ');
    const parts = raw.split(' ');
    const name = String(parts.shift() || '').toLowerCase().replace(/^[./!#']+/, '');
    const args = parts;
    if (!name) return null;

    return { name, args, raw: [name, ...args].join(' ') };
}

function stripCommandTags(text) {
    return String(text || '').replace(/\[COMMAND_EXECUTE:\s*[^\]]+?\]/gi, '');
}

async function transcribeVoiceIfNeeded(m, sock) {
    if (!isVoiceMessage(m)) return '';

    const mimetype = m?.content?.mimetype || 'audio/ogg; codecs=opus';
    const buffer = await downloadMediaBuffer(sock, buildMediaDownloadTarget(m));
    if (!buffer || buffer.length === 0) {
        throw new Error('Vocal introuvable');
    }
    if (buffer.length > MAX_VOICE_BYTES) {
        throw new Error('Vocal trop lourd pour transcription');
    }

    return callGroqTranscription(buffer, mimetype);
}

async function extractImageContextIfNeeded(m, sock) {
    const media = getImageMedia(m);
    if (!media) return null;

    const buffer = await downloadMediaBuffer(sock, media.message);
    if (!buffer || buffer.length === 0) {
        throw new Error('Image introuvable');
    }
    if (buffer.length > MAX_IMAGE_BYTES) {
        throw new Error('Image trop lourde pour analyse');
    }

    const normalized = await normalizeImageForVision(buffer);
    return {
        source: media.source,
        mimeType: normalized.mimeType,
        width: normalized.width,
        height: normalized.height,
        dataUrl: `data:${normalized.mimeType};base64,${normalized.buffer.toString('base64')}`
    };
}

async function extractDocumentContextIfNeeded(m, sock) {
    const media = getDocumentMedia(m);
    if (!media) return null;

    const buffer = await downloadMediaBuffer(sock, media.message);
    if (!buffer || buffer.length === 0) {
        throw new Error('Document introuvable');
    }
    if (buffer.length > MAX_DOCUMENT_BYTES) {
        throw new Error(`Document trop lourd (${formatBytes(buffer.length)}). Limite: ${formatBytes(MAX_DOCUMENT_BYTES)}`);
    }

    const fileName = getDocumentFileName(media.content);
    const mimeType = String(media.content?.mimetype || '').toLowerCase();
    const extension = getDocumentExtension(fileName, mimeType);
    const extraction = await extractTextFromDocument(buffer, { fileName, mimeType, extension });
    const cleaned = cleanExtractedDocumentText(extraction.text);

    if (!cleaned) {
        throw new Error(`Aucun texte lisible extrait (${extension || mimeType || 'format inconnu'})`);
    }

    const truncated = cleaned.length > MAX_DOCUMENT_TEXT_CHARS;
    const text = truncated
        ? `${cleaned.slice(0, MAX_DOCUMENT_TEXT_CHARS)}\n...[document tronqué]`
        : cleaned;

    return {
        source: media.source,
        fileName,
        mimeType: mimeType || extraction.mimeType || '',
        extension,
        text,
        truncated,
        sizeLabel: formatBytes(buffer.length),
        extractionLabel: extraction.label
    };
}

function getDocumentMedia(m) {
    if (m?.type === 'documentMessage') {
        return { source: 'message', message: buildMediaDownloadTarget(m), content: m.content };
    }
    if (m?.quoted?.type === 'documentMessage') {
        return { source: 'quoted', message: buildMediaDownloadTarget(m.quoted), content: m.quoted.content };
    }
    return null;
}

function getDocumentFileName(content = {}) {
    return String(content.fileName || content.title || content.caption || 'document').trim() || 'document';
}

function getDocumentExtension(fileName = '', mimeType = '') {
    const ext = path.extname(String(fileName || '').toLowerCase()).replace(/^\./, '');
    if (ext) return ext;

    if (mimeType.includes('pdf')) return 'pdf';
    if (mimeType.includes('wordprocessingml')) return 'docx';
    if (mimeType.includes('msword')) return 'doc';
    if (mimeType.includes('spreadsheetml')) return 'xlsx';
    if (mimeType.includes('excel')) return 'xls';
    if (mimeType.includes('csv')) return 'csv';
    if (mimeType.includes('json')) return 'json';
    if (mimeType.includes('html')) return 'html';
    if (mimeType.includes('xml')) return 'xml';
    if (mimeType.includes('rtf')) return 'rtf';
    if (mimeType.includes('text')) return 'txt';

    return '';
}

async function extractTextFromDocument(buffer, meta = {}) {
    const extension = meta.extension;
    const mimeType = String(meta.mimeType || '').toLowerCase();

    if (extension === 'pdf' || mimeType.includes('pdf')) {
        const pdfParse = require('pdf-parse');
        const parsed = await pdfParse(buffer);
        return { text: parsed.text || '', label: `PDF (${parsed.numpages || '?'} page(s))` };
    }

    if (extension === 'docx' || mimeType.includes('wordprocessingml')) {
        const mammoth = require('mammoth');
        const parsed = await mammoth.extractRawText({ buffer });
        return { text: parsed.value || '', label: 'Word DOCX' };
    }

    if (['xlsx', 'xls', 'ods'].includes(extension) || mimeType.includes('spreadsheet')) {
        return { text: extractWorkbookText(buffer), label: 'Tableur' };
    }

    if (['txt', 'md', 'csv', 'json', 'xml', 'rtf', 'log', 'js', 'ts', 'html', 'htm', 'css'].includes(extension) ||
        mimeType.startsWith('text/') ||
        mimeType.includes('json') ||
        mimeType.includes('xml') ||
        mimeType.includes('html')) {
        const raw = buffer.toString('utf8');
        if (extension === 'html' || extension === 'htm' || mimeType.includes('html')) {
            const { convert: htmlToText } = require('html-to-text');
            return { text: htmlToText(raw, { wordwrap: false, selectors: [{ selector: 'a', options: { ignoreHref: false } }] }), label: 'HTML' };
        }
        if (extension === 'rtf' || mimeType.includes('rtf')) {
            return { text: stripRtf(raw), label: 'RTF' };
        }
        return { text: raw, label: extension ? extension.toUpperCase() : 'Texte' };
    }

    if (extension === 'doc') {
        throw new Error('Le vieux format .doc binaire n’est pas encore lisible. Renvoie le fichier en .docx ou PDF.');
    }

    throw new Error(`Format document non pris en charge: ${extension || mimeType || 'inconnu'}`);
}

function extractWorkbookText(buffer) {
    const XLSX = require('xlsx');
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const sections = [];

    for (const sheetName of workbook.SheetNames.slice(0, 8)) {
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: '' })
            .slice(0, 80)
            .map(row => row.map(value => String(value ?? '').trim()).join(' | ').trim())
            .filter(Boolean);

        if (rows.length > 0) {
            sections.push(`Feuille: ${sheetName}\n${rows.join('\n')}`);
        }
    }

    return sections.join('\n\n');
}

function stripRtf(text = '') {
    return String(text || '')
        .replace(/\\'[0-9a-fA-F]{2}/g, ' ')
        .replace(/\\[a-zA-Z]+\d* ?/g, ' ')
        .replace(/[{}]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function cleanExtractedDocumentText(text = '') {
    return String(text || '')
        .replace(/\u0000/g, '')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{4,}/g, '\n\n\n')
        .replace(/[ \t]{2,}/g, ' ')
        .trim();
}

function formatBytes(bytes = 0) {
    const value = Number(bytes) || 0;
    if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
    if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${value} B`;
}

function getImageMedia(m) {
    if (m?.type === 'imageMessage') {
        return { source: 'message', message: buildMediaDownloadTarget(m) };
    }
    if (m?.quoted?.type === 'imageMessage') {
        return { source: 'quoted', message: buildMediaDownloadTarget(m.quoted) };
    }
    return null;
}

function buildMediaDownloadTarget(media = {}) {
    return {
        key: media.key || {},
        type: media.type,
        content: media.content
    };
}

async function normalizeImageForVision(buffer) {
    const image = sharp(buffer, { animated: false }).rotate();
    const metadata = await image.metadata();
    const width = metadata.width || 0;
    const height = metadata.height || 0;
    const resize = Math.max(width, height) > 1280
        ? { width: 1280, height: 1280, fit: 'inside', withoutEnlargement: true }
        : null;

    let pipeline = image;
    if (resize) pipeline = pipeline.resize(resize);

    let output = await pipeline.jpeg({ quality: 82, mozjpeg: true }).toBuffer();
    if (output.length > MAX_IMAGE_DATA_BYTES) {
        output = await sharp(output).jpeg({ quality: 68, mozjpeg: true }).toBuffer();
    }

    const finalMetadata = await sharp(output).metadata();
    return {
        buffer: output,
        mimeType: 'image/jpeg',
        width: finalMetadata.width || width,
        height: finalMetadata.height || height
    };
}

function pickAudioFilename(mimetype = '') {
    const type = String(mimetype).toLowerCase();
    if (type.includes('mpeg') || type.includes('mp3')) return 'voice.mp3';
    if (type.includes('mp4') || type.includes('m4a')) return 'voice.m4a';
    if (type.includes('wav')) return 'voice.wav';
    if (type.includes('webm')) return 'voice.webm';
    return 'voice.ogg';
}

function normalizeJid(jid = '') {
    return String(jid || '').trim().replace(/:\d+@/, '@');
}

function extractPhoneNumber(value = '') {
    return String(value || '').replace(/\D/g, '');
}

function getBotSessionId(sock = null) {
    const candidates = [
        process.env.BOT_PAIRING_PHONE,
        sock?.user?.id,
        sock?.user?.jid,
        sock?.user?.lid,
        sock?.user?.pn,
        sock?.user?.phoneNumber,
        process.env.BOT_INSTANCE_LABEL
    ].filter(Boolean);

    for (const candidate of candidates) {
        const phone = extractPhoneNumber(candidate);
        if (phone && phone.length >= 8) return phone;
    }

    const label = String(process.env.BOT_INSTANCE_LABEL || 'main')
        .replace(/^client-/, '')
        .replace(/[^a-zA-Z0-9_-]/g, '')
        .trim();

    return label || 'main';
}

function getAiScopedKey(sock, chatId) {
    const sessionId = getBotSessionId(sock);
    const chat = String(chatId || '').trim();
    return chat ? `${sessionId}:${chat}` : '';
}

function getSessionDataDir(sessionId = 'main') {
    const safeSessionId = String(sessionId || 'main').replace(/[^a-zA-Z0-9_-]/g, '') || 'main';
    return path.join(AI_SESSIONS_DIR, safeSessionId);
}

function getMemoriesPath(sessionId = 'main') {
    if (sessionId === 'main') return MEMORIES_PATH;
    return path.join(getSessionDataDir(sessionId), 'memories.txt');
}

function getTasksPath(sessionId = 'main') {
    if (sessionId === 'main') return path.join(__dirname, '../data/tasks.json');
    return path.join(getSessionDataDir(sessionId), 'tasks.json');
}

function getBotJidCandidates(sock) {
    return [
        sock?.user?.id,
        sock?.user?.jid,
        sock?.user?.lid,
        sock?.user?.pn,
        sock?.user?.phoneNumber
    ].filter(Boolean);
}

function isSameBotJid(jid, sock) {
    const normalized = normalizeJid(jid);
    const phone = extractPhoneNumber(jid);

    return getBotJidCandidates(sock).some(candidate => {
        return normalizeJid(candidate) === normalized ||
            (phone && extractPhoneNumber(candidate) === phone);
    });
}

module.exports = {
    generateAgentReply,
    generateAgentReplyResult,
    shouldTriggerAgent,
    startTaskReminderScheduler
};
