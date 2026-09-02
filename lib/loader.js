// lib/loader.js - Chargeur de commandes N9uf_S
const fs = require('fs');
const path = require('path');

const IGNORED_COMMAND_FILES = new Set([
    'premium.js',
    'addpremium.js',
    'checkpremium.js',
    'delpremium.js',
    'broadcast.js',
    'check.js'
]);

async function loadCommands() {
    const commands = new Map();
    let primaryCount = 0;
    let aliasCount = 0;
    const skipped = [];
    const failed = [];
    const duplicates = [];
    const commandsPath = path.join(__dirname, '..', 'commands');
    const verbose = process.env.BOT_COMMAND_LOAD_VERBOSE === '1' || process.env.DEBUG_COMMAND_LOAD === '1';
    
    console.log(`📂 Chargement depuis: ${commandsPath}`);
    
    if (!fs.existsSync(commandsPath)) {
        fs.mkdirSync(commandsPath, { recursive: true });
        console.log('⚠️ Dossier commands créé (vide)');
        return commands;
    }
    
    const files = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js') && !IGNORED_COMMAND_FILES.has(f));
    
    for (const file of files) {
        try {
            const filePath = path.join(commandsPath, file);
            delete require.cache[require.resolve(filePath)];
            const cmd = require(filePath);
            normalizeCommand(cmd);
            
            if (cmd.name && typeof cmd.execute === 'function') {
                cmd.__file = file;
                if (commands.has(cmd.name)) {
                    duplicates.push({ name: cmd.name, file, previousFile: commands.get(cmd.name).__file || 'unknown' });
                }
                commands.set(cmd.name, cmd);
                primaryCount++;
                if (cmd.aliases && Array.isArray(cmd.aliases)) {
                    cmd.aliases.forEach(a => {
                        if (commands.has(a)) {
                            duplicates.push({ name: a, file, previousFile: commands.get(a).__file || 'unknown' });
                        }
                        commands.set(a, cmd);
                        aliasCount++;
                    });
                }
                if (verbose) {
                    console.log(`   ✅ ${file}`);
                }
            } else {
                skipped.push({
                    file,
                    reason: getSkipReason(cmd)
                });
            }
        } catch (err) {
            failed.push({ file, error: err.message });
            console.error(`   ❌ ${file}: ${err.message}`);
        }
    }
    
    commands.stats = {
        primaryCount,
        aliasCount,
        totalEntries: commands.size,
        skippedCount: skipped.length,
        failedCount: failed.length,
        duplicateCount: duplicates.length,
        skipped,
        failed,
        duplicates
    };

    console.log(`📦 Total: ${primaryCount} commandes principales (${aliasCount} alias)`);
    if (skipped.length > 0) {
        console.log(`ℹ️ Legacy/non dynamiques: ${skipped.length}`);
    }
    if (duplicates.length > 0) {
        console.log(`⚠️ Alias/noms en double: ${duplicates.length}`);
    }
    return commands;
}

function getSkipReason(cmd) {
    if (typeof cmd === 'function') return 'legacy function export';
    if (!cmd || typeof cmd !== 'object') return `unsupported export: ${typeof cmd}`;
    if (!cmd.name && typeof cmd.execute !== 'function') return 'missing name and execute';
    if (!cmd.name) return 'missing name';
    if (typeof cmd.execute !== 'function') return 'missing execute';
    return 'unknown shape';
}

function normalizeCommand(cmd) {
    if (!cmd || typeof cmd !== 'object') return;

    if (!cmd.execute && typeof cmd.exec === 'function') {
        cmd.execute = (sock, m, args) => cmd.exec(sock, m.raw || m, args);
    }

    if (!Array.isArray(cmd.aliases) && Array.isArray(cmd.alias)) {
        cmd.aliases = cmd.alias;
    }
}

module.exports = { loadCommands };
