// lib/maraboutDetector.js - Détection de marabouts N9uf_S
const settings = require('../settings');

function detectMarabout(text, caption = '') {
    if (!settings.antiMarabout?.enabled) return { detected: false };
    
    const fullText = normalize(`${text || ''} ${caption || ''}`);
    if (!fullText.trim()) return { detected: false };
    
    const instantTerms = [
        'marabout', 'maraboute', 'maraboutage',
        'retour affectif', 'retour d affection',
        'desenvoutement', 'envoutement', 'desenvouter', 'envouter',
        'travaux occultes', 'travail occulte',
        'multiplication d argent', 'multiplication argent',
        'multiplie argent', 'multiplie l argent', 'multiplie de l argent',
        'multiplier argent', 'multiplier l argent', 'multiplier de l argent',
        'argent magique', 'argent facile', 'rituel d argent', 'rituel argent',
        'portefeuille magique', 'valise magique',
        'bague magique', 'parfum magique', 'savon magique',
        'love spell', 'bring back lost lover', 'bring back my ex',
        'money ritual', 'money spell', 'wealth spell',
        'spiritual cleansing', 'curse removal', 'remove bad luck',
        'black magic', 'dark magic', 'voodoo spell',
        'magic wallet', 'magic ring', 'magic soap', 'magic perfume'
    ];

    for (const term of instantTerms) {
        if (containsTerm(fullText, term)) {
            return { detected: true, reason: `Expression suspecte : "${term}"` };
        }
    }

    let score = 0;
    const reasons = [];

    const occultTerms = [
        'voyant', 'voyante', 'medium', 'guerisseur', 'sorcier', 'sorciere',
        'chaman', 'chamane', 'cartomancien', 'cartomancienne', 'tarologue',
        'numerologue', 'astrologue', 'voyance', 'divination', 'occultisme',
        'grigri', 'gris gris', 'amulette', 'talisman',
        'spiritualist', 'healer', 'witch doctor', 'psychic', 'fortune teller',
        'spell caster', 'sorcerer', 'occult', 'ritual', 'voodoo'
    ];
    const weakTerms = [
        'magie', 'magique', 'maitre', 'grand maitre', 'horoscope',
        'puissant', 'efficace', 'serieux', 'competent',
        'powerful', 'guaranteed', 'effective', 'serious', 'trusted', 'authentic'
    ];
    const contactTerms = [
        'whatsapp moi', 'whatsapp-moi', 'contacte moi', 'appelez',
        'contactez', 'consultez', 'inbox', 'mp', 'message prive',
        'contact me', 'dm me', 'private message', 'text me', 'call me', 'consult me'
    ];

    const occultMatches = matchTerms(fullText, occultTerms);
    const weakMatches = matchTerms(fullText, weakTerms);
    const contactMatches = matchTerms(fullText, contactTerms);

    if (occultMatches.length > 0) {
        score += 2;
        reasons.push(`Terme occulte : "${occultMatches[0]}"`);
    }

    if (weakMatches.length > 0) {
        score += 1;
        reasons.push(`Mot suspect : "${weakMatches[0]}"`);
    }

    if (contactMatches.length > 0) {
        score += 1;
        reasons.push(`Appel au contact : "${contactMatches[0]}"`);
    }

    const suspiciousDomains = settings.antiMarabout?.suspiciousDomains || [];
    const domain = suspiciousDomains.find(d => fullText.includes(normalize(d)));
    if (domain) {
        score += 2;
        reasons.push(`Lien suspect : ${domain}`);
    }

    if (hasSuspiciousPhone(fullText)) {
        score += 2;
        reasons.push('Numéro de téléphone suspect');
    }

    if (score >= 3) {
        return { detected: true, reason: reasons.join(' + ') };
    }
    
    return { detected: false };
}

function isMaraboutImage(caption = '') {
    if (!caption) return { detected: false };
    
    const lowerCaption = normalize(caption);
    const imageKeywords = settings.antiMarabout?.imageKeywords || [];
    
    for (const keyword of imageKeywords) {
        if (containsTerm(lowerCaption, normalize(keyword))) {
            return { detected: true, reason: `Image suspecte : "${keyword}"` };
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

function containsTerm(text, term) {
    const normalizedTerm = normalize(term);
    if (!normalizedTerm) return false;

    if (normalizedTerm.includes(' ')) {
        return text.includes(normalizedTerm);
    }

    return new RegExp(`(^|\\W)${escapeRegex(normalizedTerm)}(\\W|$)`, 'i').test(text);
}

function matchTerms(text, terms) {
    return terms.filter(term => containsTerm(text, term));
}

function hasSuspiciousPhone(text) {
    const compact = text.replace(/[\s().-]/g, '');
    return /(?:\+|00)?22[569]\d{8,10}/.test(compact);
}

function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = { detectMarabout, isMaraboutImage };
