const fs = require('fs');
const path = require('path');

let BAD_WORDS = [];
let SOFT_WORDS = [];

// Charger les mots depuis le fichier
function loadBadWords() {
    try {
        const filePath = path.join(__dirname, '../data/badwords.txt');
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('#'));

        let currentSection = null;
        for (const line of lines) {
            if (line === '[HARD]') {
                currentSection = 'hard';
            } else if (line === '[SOFT]') {
                currentSection = 'soft';
            } else if (currentSection && line) {
                // Séparer les mots par des virgules et nettoyer
                const words = line.split(',').map(word => word.trim()).filter(word => word);
                if (currentSection === 'hard') {
                    BAD_WORDS.push(...words);
                } else if (currentSection === 'soft') {
                    SOFT_WORDS.push(...words);
                }
            }
        }
    } catch (error) {
        console.error('Erreur lors du chargement des badwords:', error.message);
        // Fallback avec quelques mots de base
        BAD_WORDS = ['con', 'connard', 'salope', 'merde'];
        SOFT_WORDS = ['gaou', 'mougou'];
    }
}

// Charger les mots au démarrage
loadBadWords();

function detectBadWords(text = '') {
    const normalized = normalize(text);
    if (!normalized) return { detected: false };

    for (const expression of BAD_WORDS) {
        if (containsExpression(normalized, expression)) {
            return {
                detected: true,
                word: expression,
                level: SOFT_WORDS.includes(normalize(expression)) ? 'soft' : 'hard',
                reason: `Expression interdite : "${expression}"`
            };
        }
    }

    for (const expression of SOFT_WORDS) {
        if (containsExpression(normalized, expression)) {
            return {
                detected: true,
                word: expression,
                level: 'soft',
                reason: `Expression interdite : "${expression}"`
            };
        }
    }

    return { detected: false };
}

function normalize(value) {
    return String(value)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[’']/g, ' ')
        .replace(/[-_]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function containsExpression(text, expression) {
    const normalized = normalize(expression);
    if (!normalized) return false;

    if (normalized.includes(' ')) {
        return text.includes(normalized);
    }

    return new RegExp(`(^|\\W)${escapeRegex(normalized)}(\\W|$)`, 'i').test(text);
}

function reloadBadWords() {
    BAD_WORDS = [];
    SOFT_WORDS = [];
    loadBadWords();
}

function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
    detectBadWords,
    reloadBadWords,
    BAD_WORDS,
    SOFT_WORDS
};
