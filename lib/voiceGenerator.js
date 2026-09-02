// lib/voiceGenerator.js - TTS avec ElevenLabs (principal) + MsEdge TTS (voix féminine douce) + Google TTS (fallback)

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const gtts = require('google-tts-api');
const { execSync } = require('child_process');

let MsEdgeTTS = null;
let OUTPUT_FORMAT = null;
try {
    const msedge = require('msedge-tts');
    MsEdgeTTS = msedge.MsEdgeTTS;
    OUTPUT_FORMAT = msedge.OUTPUT_FORMAT;
} catch {
    console.warn('⚠️ msedge-tts non installé, fallback sur Google TTS. Lance: npm install msedge-tts');
}

const DEFAULT_ELEVENLABS_VOICE_ID = '21m00Tcm4TlvDq8ikWAM'; // Rachel: voix féminine douce

// Voix féminines douces par langue
const EDGE_VOICES = {
    fr: 'fr-FR-DeniseNeural',
    en: 'en-US-JennyNeural',
    ar: 'ar-MA-MounaNeural',
    es: 'es-ES-ElviraNeural',
    de: 'de-DE-KatjaNeural',
    pt: 'pt-BR-FranciscaNeural',
};

function getApiKey() {
    return process.env.ELEVENLABS_API_KEY || '';
}

function getVoiceId() {
    return process.env.ELEVENLABS_VOICE_ID || DEFAULT_ELEVENLABS_VOICE_ID;
}

function applyPronunciationHints(text = '') {
    return String(text || '')
        .replace(/\bN9uf_S\b/gi, '9 S')
        .replace(/\bYuna\b/gi, 'Youna')
        .replace(/(?:𝐘𝐔𝐍|YUN|Yun)[∆Δ]?(?![A-Za-zÀ-ÿ])/g, 'Youna');
}

function cleanTextForSpeech(text = '') {
    return applyPronunciationHints(text)
        .replace(/\[[A-Z_]+:[^\]]*\]/gi, ' ')
        .replace(/\[TTS(?:_LANG:\s*[a-z]{2})?\]/gi, ' ')
        .replace(/[╔╗╚╝═║┃┏┓┗┛━─⟪⟫❐❏〉•]/g, ' ')
        .replace(/[`*_~#$>{}<|\\[\]()=+^]/g, ' ')
        .replace(/[.!?]{2,}/g, '.')
        .replace(/[#*0-9]\uFE0F?\u20E3/gu, ' ')
        .replace(/[\u200D\uFE0E\uFE0F]/g, ' ')
        .replace(/[\u{1F1E6}-\u{1F1FF}]{2}/gu, ' ')
        .replace(/\u20E3/g, ' ')
        .replace(/\p{Extended_Pictographic}/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

// ─── Source 1 : ElevenLabs ────────────────────────────────────────────────────

async function generateVoiceElevenLabs(text, lang = 'fr') {
    try {
        const apiKey = getApiKey();
        const voiceId = getVoiceId();

        if (!apiKey) return null;

        const limitedText = text.substring(0, 1000);
        console.log(`🎤 ElevenLabs: "${limitedText.substring(0, 50)}..." (${lang})`);

        const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`;
        const response = await axios.post(url, {
            text: limitedText,
            model_id: 'eleven_turbo_v2_5',
            voice_settings: {
                stability: 0.86,
                similarity_boost: 0.74,
                style: 0.06,
                use_speaker_boost: false
            }
        }, {
            headers: {
                'xi-api-key': apiKey,
                'Content-Type': 'application/json'
            },
            responseType: 'arraybuffer',
            timeout: 30000
        });

        if (response.status !== 200) throw new Error(`ElevenLabs status ${response.status}`);

        const audioBuffer = Buffer.from(response.data);
        if (audioBuffer.length === 0) throw new Error('Buffer vide');

        console.log(`✅ ElevenLabs généré: ${audioBuffer.length} bytes`);
        return audioBuffer;

    } catch (error) {
        console.warn(`⚠️ ElevenLabs échoué: ${error.message}`);
        return null;
    }
}

// ─── Source 2 : MsEdge TTS (voix féminine douce, gratuit) ────────────────────

async function generateVoiceMsEdgeTTS(text, lang = 'fr') {
    if (!MsEdgeTTS || !OUTPUT_FORMAT) return null;

    try {
        const limitedText = text.substring(0, 500);
        const voice = EDGE_VOICES[lang] || EDGE_VOICES['fr'];

        console.log(`🎤 MsEdge TTS: "${limitedText.substring(0, 50)}..." — voix: ${voice}`);

        const tts = new MsEdgeTTS();
        await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

        // toStream() retourne une Promise<{ audioStream, metadataStream }>
        const { audioStream } = await tts.toStream(limitedText);

        const chunks = [];
        await new Promise((resolve, reject) => {
            audioStream.on('data', chunk => chunks.push(chunk));
            audioStream.on('end', resolve);
            audioStream.on('error', reject);
            setTimeout(() => reject(new Error('MsEdge TTS timeout')), 15000);
        });

        const audioBuffer = Buffer.concat(chunks);
        if (!audioBuffer || audioBuffer.length === 0) throw new Error('Buffer vide');

        console.log(`✅ MsEdge TTS généré: ${audioBuffer.length} bytes`);
        return audioBuffer;

    } catch (error) {
        console.warn(`⚠️ MsEdge TTS échoué: ${error.message}`);
        return null;
    }
}

// ─── Source 3 : Google TTS (dernier recours) ─────────────────────────────────

async function generateVoiceGoogleTTS(text, lang = 'fr') {
    try {
        const limitedText = text.substring(0, 200);
        console.log(`🎤 Google TTS (fallback): "${limitedText.substring(0, 50)}..." (${lang})`);

        const url = await gtts.getAudioUrl(limitedText, lang, 'https://translate.google.com');
        if (!url) throw new Error('URL audio vide');

        console.log(`   URL: ${url.substring(0, 60)}...`);

        const response = await axios.get(url, {
            responseType: 'arraybuffer',
            timeout: 15000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        const audioBuffer = Buffer.from(response.data);
        if (!audioBuffer || audioBuffer.length === 0) throw new Error('Buffer audio vide');

        console.log(`✅ Google TTS généré: ${audioBuffer.length} bytes`);
        return audioBuffer;

    } catch (error) {
        console.warn(`⚠️ Google TTS échoué: ${error.message}`);
        return null;
    }
}

// ─── Orchestrateur principal ──────────────────────────────────────────────────

async function generateVoice(text, lang = 'fr') {
    const speechText = cleanTextForSpeech(text);

    if (!speechText || speechText.trim().length === 0) {
        throw new Error('Le texte ne peut pas être vide');
    }

    // 1. ElevenLabs (meilleure qualité, si clé dispo)
    console.log(`\n🎙️ Tentative ElevenLabs...`);
    let audioBuffer = await generateVoiceElevenLabs(speechText, lang);
    if (audioBuffer) return audioBuffer;

    // 2. MsEdge TTS (voix féminine douce)
    console.log(`\n🎙️ Tentative MsEdge TTS (voix féminine douce)...`);
    audioBuffer = await generateVoiceMsEdgeTTS(speechText, lang);
    if (audioBuffer) return audioBuffer;

    // 3. Google TTS (dernier recours)
    console.log(`\n🎙️ Fallback Google TTS...`);
    audioBuffer = await generateVoiceGoogleTTS(speechText, lang);
    if (audioBuffer) return audioBuffer;

    throw new Error('Tous les TTS ont échoué');
}

// ─── Conversion MP3 → Opus OGG (format WhatsApp PTT) ─────────────────────────

function convertMp3ToOpus(mp3Path, opusPath) {
    try {
        if (!fs.existsSync(mp3Path)) {
            console.warn(`⚠️ Fichier MP3 non trouvé: ${mp3Path}`);
            return false;
        }

        const cmd = `ffmpeg -i "${mp3Path}" -c:a libopus -b:a 32k -ar 48000 -f ogg "${opusPath}" -y 2>/dev/null`;
        console.log(`🔄 Conversion MP3 → Opus OGG (48kHz)...`);
        execSync(cmd, { encoding: 'utf-8' });

        if (!fs.existsSync(opusPath)) throw new Error('Fichier Opus OGG non créé');

        const stats = fs.statSync(opusPath);
        console.log(`✅ Opus OGG généré: ${opusPath} (${stats.size} bytes)`);

        try {
            fs.unlinkSync(mp3Path);
            console.log(`🗑️ MP3 supprimé`);
        } catch (e) {
            console.warn(`⚠️ Erreur suppression MP3: ${e.message}`);
        }

        return true;

    } catch (error) {
        console.warn(`⚠️ Conversion Opus échouée: ${error.message}`);
        return false;
    }
}

// ─── Génération + sauvegarde fichier vocal ────────────────────────────────────

async function generateAndSaveVoice(text, lang = 'fr') {
    try {
        const speechText = cleanTextForSpeech(text);
        console.log(`\n💬 generateAndSaveVoice: "${speechText.substring(0, 50)}..." en ${lang}\n`);

        const audioBuffer = await generateVoice(speechText, lang);

        if (!audioBuffer || audioBuffer.length === 0) {
            throw new Error('Buffer audio vide retourné');
        }

        console.log(`✓ Buffer généré: ${audioBuffer.length} bytes`);

        const tempDir = path.join(__dirname, '../temp');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        const mp3FileName = `voice_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.mp3`;
        const mp3Path = path.join(tempDir, mp3FileName);

        console.log(`✓ Sauvegarde du fichier MP3: ${mp3Path}`);
        fs.writeFileSync(mp3Path, audioBuffer);

        const mp3Stats = fs.statSync(mp3Path);
        console.log(`✅ Fichier MP3 créé: ${mp3Stats.size} bytes`);

        const opusFileName = `voice_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.ogg`;
        const opusPath = path.join(tempDir, opusFileName);

        const conversionSuccess = convertMp3ToOpus(mp3Path, opusPath);

        if (!conversionSuccess || !fs.existsSync(opusPath)) {
            console.warn(`⚠️ Conversion Opus échouée, utilisation MP3 en fallback`);
            scheduleCleanup(mp3Path);
            return mp3Path;
        }

        scheduleCleanup(opusPath);
        return opusPath;

    } catch (error) {
        console.error(`❌ ERREUR generateAndSaveVoice: ${error.message}`);
        return null;
    }
}

function scheduleCleanup(filePath) {
    setTimeout(() => {
        try {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                console.log(`🗑️ Fichier nettoyé: ${path.basename(filePath)}`);
            }
        } catch (e) {
            console.warn(`⚠️ Erreur nettoyage: ${e.message}`);
        }
    }, 5 * 60 * 1000);
}

// ─── Helpers TTS tags ─────────────────────────────────────────────────────────

function extractLanguageTag(text) {
    const match = text.match(/\[TTS_LANG:\s*([a-z]{2})\]/i);
    return match ? match[1].toLowerCase() : 'fr';
}

function cleanTTSTags(text) {
    return text
        .replace(/\[TTS\]/gi, '')
        .replace(/\[TTS_LANG:\s*[a-z]{2}\]/gi, '')
        .trim();
}

function hasTTSRequest(text) {
    return /\[TTS\]|\[TTS_LANG:\s*[a-z]{2}\]/i.test(text);
}

function extractTTSInfo(text) {
    if (!hasTTSRequest(text)) return null;
    return {
        lang: extractLanguageTag(text),
        text: cleanTTSTags(text)
    };
}

module.exports = {
    generateVoice,
    generateAndSaveVoice,
    extractLanguageTag,
    cleanTTSTags,
    cleanTextForSpeech,
    hasTTSRequest,
    extractTTSInfo,
    isConfigured: () => !!getApiKey(),
    getVoiceId
};
