// lib/voiceGeneratorElevenLabs.js - TTS avec ElevenLabs (meilleure qualité)

const { ElevenLabsClient } = require("@elevenlabs/elevenlabs-js");
const fs = require('fs');
const path = require('path');

// Configuration ElevenLabs
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || '';
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';

// Client ElevenLabs
let elevenLabsClient = null;

function initElevenLabsClient() {
    if (!ELEVENLABS_API_KEY) {
        console.warn('⚠️ ELEVENLABS_API_KEY non configurée! TTS ElevenLabs désactivé.');
        return false;
    }
    
    try {
        elevenLabsClient = new ElevenLabsClient({
            apiKey: ELEVENLABS_API_KEY
        });
        console.log(`✅ Client ElevenLabs initialisé avec voix: ${ELEVENLABS_VOICE_ID}`);
        return true;
    } catch (err) {
        console.error('❌ Erreur initialisation ElevenLabs:', err.message);
        return false;
    }
}

function applyPronunciationHints(text = '') {
    return String(text || '')
        .replace(/\bN9uf_S\b/gi, '9 S')
        .replace(/\bYuna\b/gi, 'Youna')
        .replace(/(?:𝐘𝐔𝐍|YUN|Yun)[∆Δ]?(?![A-Za-zÀ-ÿ])/g, 'Youna');
}

function cleanTextForSpeech(text = '') {
    return applyPronunciationHints(text)
        .replace(/[#*0-9]\uFE0F?\u20E3/gu, ' ')
        .replace(/[\u200D\uFE0E\uFE0F]/g, ' ')
        .replace(/[\u{1F1E6}-\u{1F1FF}]{2}/gu, ' ')
        .replace(/\u20E3/g, ' ')
        .replace(/\p{Extended_Pictographic}/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Génère un fichier audio avec ElevenLabs
 * @param {string} text - Texte à convertir
 * @param {string} lang - Code de langue (pour logs, ElevenLabs détecte automatique)
 * @returns {Promise<Buffer>} Buffer audio MP3
 */
async function generateVoice(text, lang = 'fr') {
    try {
        const speechText = cleanTextForSpeech(text);

        if (!speechText || speechText.trim().length === 0) {
            throw new Error('Le texte ne peut pas être vide');
        }

        // Initialiser le client si nécessaire
        if (!elevenLabsClient) {
            const initialized = initElevenLabsClient();
            if (!initialized) {
                throw new Error('Client ElevenLabs non disponible');
            }
        }

        // Limiter la longueur du texte
        const limitedText = speechText.substring(0, 1000);

        console.log(`🎤 Génération ElevenLabs: "${limitedText.substring(0, 50)}..." (${lang})`);

        // Générer l'audio avec ElevenLabs
        const audioStream = await elevenLabsClient.textToSpeech.convert({
            text: limitedText,
            voice_id: ELEVENLABS_VOICE_ID,
            output_format: 'mp3_22050_32',
            model_id: 'eleven_turbo_v2_5',
            voice_settings: {
                stability: 0.72,
                similarity_boost: 0.82,
                style: 0.18,
                use_speaker_boost: true
            }
        });

        // Convertir le stream en Buffer
        const chunks = [];
        for await (const chunk of audioStream) {
            chunks.push(chunk);
        }

        const audioBuffer = Buffer.concat(chunks);

        if (audioBuffer.length === 0) {
            throw new Error('Buffer audio vide');
        }

        console.log(`✅ Audio ElevenLabs généré: ${audioBuffer.length} bytes`);
        return audioBuffer;

    } catch (error) {
        console.error('❌ Erreur ElevenLabs TTS:', error.message);
        throw error;
    }
}

/**
 * Génère et sauvegarde un fichier vocal temporaire
 * @param {string} text - Texte à convertir
 * @param {string} lang - Code de langue
 * @returns {Promise<string|null>} Chemin du fichier ou null si erreur
 */
async function generateAndSaveVoice(text, lang = 'fr') {
    try {
        const speechText = cleanTextForSpeech(text);
        console.log(`\n💬 generateAndSaveVoice ElevenLabs: "${speechText.substring(0, 50)}..." en ${lang}\n`);
        
        const audioBuffer = await generateVoice(speechText, lang);
        
        if (!audioBuffer || audioBuffer.length === 0) {
            throw new Error('Buffer audio vide retourné');
        }
        
        console.log(`✓ Buffer généré: ${audioBuffer.length} bytes`);
        
        const tempDir = path.join(__dirname, '../temp');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
            console.log(`📁 Répertoire temp créé: ${tempDir}`);
        }

        const fileName = `voice_elevenlabs_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.mp3`;
        const audioPath = path.join(tempDir, fileName);
        
        console.log(`✓ Sauvegarde du fichier: ${audioPath}`);
        fs.writeFileSync(audioPath, audioBuffer);
        
        // Vérifier que le fichier existe et a la bonne taille
        const stats = fs.statSync(audioPath);
        console.log(`✅ Fichier créé: ${audioPath} (${stats.size} bytes)`);

        // Auto-cleanup après 5 minutes
        setTimeout(() => {
            try {
                if (fs.existsSync(audioPath)) {
                    fs.unlinkSync(audioPath);
                    console.log(`🗑️ Fichier nettoyé: ${audioPath}`);
                }
            } catch (e) {
                console.warn(`⚠️ Erreur nettoyage: ${e.message}`);
            }
        }, 5 * 60 * 1000);

        return audioPath;

    } catch (error) {
        console.error(`❌ ERREUR generateAndSaveVoice: ${error.message}`);
        console.error(error.stack);
        return null;
    }
}

/**
 * Détecte le code de langue à partir de la réponse de l'IA
 * @param {string} text - Texte contenant possiblement [TTS_LANG: xx]
 * @returns {string} Code de langue (défaut: 'fr')
 */
function extractLanguageTag(text) {
    const match = text.match(/\[TTS_LANG:\s*([a-z]{2})\]/i);
    return match ? match[1].toLowerCase() : 'fr';
}

/**
 * Nettoie les tags TTS d'un texte
 * @param {string} text - Texte contenant des tags TTS
 * @returns {string} Texte nettoyé
 */
function cleanTTSTags(text) {
    return text
        .replace(/\[TTS\]/gi, '')
        .replace(/\[TTS_LANG:\s*[a-z]{2}\]/gi, '')
        .trim();
}

/**
 * Vérifie si un texte contient une demande TTS
 * @param {string} text - Texte à vérifier
 * @returns {boolean}
 */
function hasTTSRequest(text) {
    return /\[TTS\]|\[TTS_LANG:\s*[a-z]{2}\]/i.test(text);
}

/**
 * Extrait l'info TTS d'un texte
 * @param {string} text - Texte contenant possiblement [TTS] ou [TTS_LANG: xx]
 * @returns {object|null} {lang, text} ou null
 */
function extractTTSInfo(text) {
    if (!hasTTSRequest(text)) return null;
    
    const lang = extractLanguageTag(text);
    const cleanText = cleanTTSTags(text);
    
    return {
        lang,
        text: cleanText
    };
}

/**
 * Initialise le client ElevenLabs au démarrage
 */
function initializeElevenLabs() {
    if (ELEVENLABS_API_KEY) {
        initElevenLabsClient();
    } else {
        console.warn('⚠️ ELEVENLABS_API_KEY non définie - TTS ElevenLabs désactivé');
    }
}

// Initialiser au chargement du module
initializeElevenLabs();

module.exports = {
    generateVoice,
    generateAndSaveVoice,
    extractLanguageTag,
    cleanTTSTags,
    cleanTextForSpeech,
    hasTTSRequest,
    extractTTSInfo,
    initializeElevenLabs,
    getApiKeyStatus: () => !!ELEVENLABS_API_KEY,
    getVoiceId: () => ELEVENLABS_VOICE_ID
};
