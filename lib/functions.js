// lib/functions.js - Utilitaires N9uf_S
const fs = require('fs');
const path = require('path');
const config = require('../config');
const settings = require('../settings');
const { asciiArt } = require('./messageStyler');

function displayLogo() {
    const logo = `
\x1b[36m
╔══════════════════════════════════════════════════╗
║                                                  ║
║ ░███╗   ██╗░█████╗░██╗   ██╗███████╗  ░██████╗   ║
║  ████╗  ██║██╔══██╗██║   ██║██╔════╝  ██╔════╝   ║
║  ██╔██╗ ██║╚█████╔╝██║   ██║█████╗    ╚██████╗   ║
║  ██║╚██╗██║ ╚══██║ ██║   ██║██╔══╝     ╚════██╗  ║
║  ██║ ╚████║╚█████║ ╚██████╔╝██║        ██████╔╝  ║
║  ╚═╝  ╚═══╝ ╚════╝  ╚═════╝ ╚═╝░██████╗╚═════╝   ║
║                                 ╚═════╝          ║
║       ░███████╗  ░██████╗ ░████████╗             ║
║        ██╔═══██╗ ██╔═══██╗ ╚══██╔══╝             ║
║        ███████═╝ ██║   ██║    ██║                ║
║        ██╔═══██╗ ██║   ██║    ██║                ║
║        ███████╔╝ ╚██████╔╝    ██║                ║
║         ╚═════╝   ╚═════╝     ╚═╝                ║
║                                                  ║
╠══════════════════════════════════════════════════╣
║  ⚡${(config.name + ' v' + config.version).padEnd(42)}    ║
║  👑 Owner  : ${(config.owner).padEnd(31)}     ║
║  🔗 Canal  : ${(config.channel ? config.channel.slice(0,30) + (config.channel.length>30?'…':'') : 'Non configuré').padEnd(31)}     ║
╚══════════════════════════════════════════════════╝\x1b[0m
    `;
    console.log(logo);
}

function logWithTime(message) {
    const time = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    return `[${time}] ${message}`;
}

function ensureDirectories() {
    const dirs = new Set([
        settings.sessionDir || './session',
        path.dirname(settings.databasePath || './data/database.db'),
        './logs',
        './assets',
        './commands',
        './temp'
    ]);

    dirs.forEach(dir => {
        const fullPath = path.join(__dirname, '..', dir);
        if (!fs.existsSync(fullPath)) {
            fs.mkdirSync(fullPath, { recursive: true });
            console.log(logWithTime(`📁 Dossier créé: ${dir}`));
        }
    });
}

async function downloadFile(url, filePath, timeout = 30000) {
    const axios = require('axios');
    
    if (!url || typeof url !== 'string') throw new Error('URL invalide');
    
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    
    try {
        const writer = fs.createWriteStream(filePath);
        const response = await axios({
            url,
            method: 'GET',
            responseType: 'stream',
            timeout: timeout,
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });
        
        response.data.pipe(writer);
        
        return new Promise((resolve, reject) => {
            writer.on('finish', () => { writer.close(); resolve(filePath); });
            writer.on('error', (err) => { fs.unlink(filePath, () => {}); reject(err); });
            response.data.on('error', (err) => { fs.unlink(filePath, () => {}); reject(err); });
        });
    } catch (err) {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        throw err;
    }
}

function cleanTempFiles(maxAgeMinutes = 60) {
    const tempDir = path.join(__dirname, '..', 'temp');
    if (!fs.existsSync(tempDir)) return;
    
    const now = Date.now();
    const maxAge = maxAgeMinutes * 60 * 1000;
    let cleaned = 0;
    
    fs.readdirSync(tempDir).forEach(file => {
        const filePath = path.join(tempDir, file);
        try {
            const stat = fs.statSync(filePath);
            if (now - stat.mtimeMs > maxAge) {
                fs.unlinkSync(filePath);
                cleaned++;
            }
        } catch (e) {}
    });
    
    if (cleaned > 0) {
        console.log(logWithTime(`🧹 ${cleaned} fichiers temporaires nettoyés`));
    }
}

// Formater la durée
function formatDuration(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return h > 0 ? `${h}h ${m}m ${s}s` : m > 0 ? `${m}m ${s}s` : `${s}s`;
}

// Formater la taille
function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

module.exports = { 
    displayLogo, 
    logWithTime, 
    ensureDirectories, 
    downloadFile, 
    cleanTempFiles,
    formatDuration,
    formatSize
};
