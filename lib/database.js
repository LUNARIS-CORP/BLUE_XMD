// lib/database.js - Version CORRIGÉE
let sqlite3 = null;
try {
    sqlite3 = require('sqlite3').verbose();
} catch (err) {
    console.warn('sqlite3 indisponible, utilisation du stockage JSON pour la base communautaire.');
}
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, '../data/community.db');
const jsonDbPath = path.join(__dirname, '../data/community.json');

// Singleton pour la base de données
let dbInstance = null;

function ensureDataDir() {
    const dataDir = path.join(__dirname, '../data');
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }
}

function defaultJsonDatabase() {
    return {
        users: {},
        warns: [],
        marabout_flags: []
    };
}

function readJsonDatabase() {
    ensureDataDir();
    if (!fs.existsSync(jsonDbPath)) {
        return defaultJsonDatabase();
    }
    try {
        return { ...defaultJsonDatabase(), ...JSON.parse(fs.readFileSync(jsonDbPath, 'utf8')) };
    } catch (err) {
        console.error('Erreur lecture community.json:', err.message);
        return defaultJsonDatabase();
    }
}

function writeJsonDatabase(data) {
    ensureDataDir();
    fs.writeFileSync(jsonDbPath, JSON.stringify(data, null, 2));
}

function nowIso() {
    return new Date().toISOString();
}

function getDatabase() {
    if (!sqlite3) return null;
    if (!dbInstance) {
        ensureDataDir();
        dbInstance = new sqlite3.Database(dbPath);
    }
    return dbInstance;
}

function initDatabase() {
    if (!sqlite3) {
        writeJsonDatabase(readJsonDatabase());
        console.log('📀 Base de données JSON N9uf_S initialisée');
        return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
        const db = getDatabase();
        
        db.serialize(() => {
            db.run(`CREATE TABLE IF NOT EXISTS groups (
                id TEXT PRIMARY KEY,
                name TEXT,
                settings TEXT DEFAULT '{}',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`, (err) => {
                if (err) console.error('Erreur création table groups:', err.message);
            });
            
            db.run(`CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                name TEXT,
                warns INTEGER DEFAULT 0,
                banned INTEGER DEFAULT 0,
                exp INTEGER DEFAULT 0,
                level INTEGER DEFAULT 1,
                last_seen DATETIME
            )`, (err) => {
                if (err) console.error('Erreur création table users:', err.message);
            });
            
            db.run(`CREATE TABLE IF NOT EXISTS warns (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT,
                group_id TEXT,
                reason TEXT,
                warned_by TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`, (err) => {
                if (err) console.error('Erreur création table warns:', err.message);
            });

            db.run(`CREATE TABLE IF NOT EXISTS marabout_flags (
                group_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                reason TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (group_id, user_id)
            )`, (err) => {
                if (err) console.error('Erreur création table marabout_flags:', err.message);
                else {
                    console.log('📀 Base de données N9uf_S initialisée');
                    resolve();
                }
            });
        });
    });
}

function addWarn(userId, groupId, reason, warnedBy) {
    if (!sqlite3) {
        const data = readJsonDatabase();
        data.users[userId] = data.users[userId] || {
            id: userId,
            name: userId.split('@')[0],
            warns: 0,
            banned: 0,
            exp: 0,
            level: 1,
            last_seen: null
        };
        data.users[userId].warns += 1;
        data.users[userId].last_seen = nowIso();
        data.warns.push({
            id: Date.now(),
            user_id: userId,
            group_id: groupId,
            reason: reason || 'Aucune raison',
            warned_by: warnedBy,
            created_at: nowIso()
        });
        writeJsonDatabase(data);
        return Promise.resolve(data.users[userId].warns);
    }

    return new Promise((resolve, reject) => {
        const db = getDatabase();
        
        // D'abord, s'assurer que l'utilisateur existe
        db.run('INSERT OR IGNORE INTO users (id, name, warns) VALUES (?, ?, 0)', 
            [userId, userId.split('@')[0]], function(err) {
            if (err) return reject(err);
            
            db.run('UPDATE users SET warns = warns + 1, last_seen = CURRENT_TIMESTAMP WHERE id = ?', 
                [userId], function(err) {
                if (err) return reject(err);
                
                db.run('INSERT INTO warns (user_id, group_id, reason, warned_by) VALUES (?, ?, ?, ?)',
                    [userId, groupId, reason || 'Aucune raison', warnedBy], function(err) {
                        if (err) return reject(err);
                        
                        db.get('SELECT warns FROM users WHERE id = ?', [userId], (err, row) => {
                            if (err) return reject(err);
                            resolve(row?.warns || 0);
                        });
                    });
            });
        });
    });
}

function getWarns(userId, groupId = null) {
    if (!sqlite3) {
        const data = readJsonDatabase();
        const rows = data.warns
            .filter(row => row.user_id === userId && (!groupId || row.group_id === groupId))
            .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
        return Promise.resolve(rows);
    }

    return new Promise((resolve, reject) => {
        const db = getDatabase();
        let query = 'SELECT * FROM warns WHERE user_id = ?';
        const params = [userId];
        
        if (groupId) {
            query += ' AND group_id = ?';
            params.push(groupId);
        }
        
        query += ' ORDER BY created_at DESC';
        
        db.all(query, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
        });
    });
}

function clearWarns(userId, groupId = null) {
    if (!sqlite3) {
        const data = readJsonDatabase();
        const before = data.warns.length;
        data.warns = data.warns.filter(row => !(row.user_id === userId && (!groupId || row.group_id === groupId)));
        if (data.users[userId]) {
            data.users[userId].warns = 0;
        }
        writeJsonDatabase(data);
        return Promise.resolve(before - data.warns.length);
    }

    return new Promise((resolve, reject) => {
        const db = getDatabase();
        let query = 'DELETE FROM warns WHERE user_id = ?';
        const params = [userId];
        
        if (groupId) {
            query += ' AND group_id = ?';
            params.push(groupId);
        }
        
        db.run(query, params, function(err) {
            if (err) return reject(err);
            
            // Réinitialise le compteur
            db.run('UPDATE users SET warns = 0 WHERE id = ?', [userId], (err) => {
                if (err) reject(err);
                else resolve(this.changes);
            });
        });
    });
}

// Fermeture propre
function closeDatabase() {
    if (!sqlite3) return Promise.resolve();

    return new Promise((resolve, reject) => {
        if (dbInstance) {
            dbInstance.close((err) => {
                if (err) reject(err);
                else {
                    dbInstance = null;
                    resolve();
                }
            });
        } else {
            resolve();
        }
    });
}

// Fermeture propre à la sortie
process.on('exit', () => {
    if (dbInstance) {
        dbInstance.close();
    }
});

// ============= SYSTÈME DE WARN COMMUNAUTAIRE =============

// Vérifie si un utilisateur a déjà warn un autre utilisateur
function hasWarned(warnedBy, targetId, groupId) {
    if (!sqlite3) {
        const data = readJsonDatabase();
        return Promise.resolve(data.warns.some(row => row.warned_by === warnedBy && row.user_id === targetId && row.group_id === groupId));
    }

    return new Promise((resolve, reject) => {
        const db = getDatabase();
        db.get(
            'SELECT COUNT(*) as count FROM warns WHERE warned_by = ? AND user_id = ? AND group_id = ?',
            [warnedBy, targetId, groupId],
            (err, row) => {
                if (err) reject(err);
                else resolve(row.count > 0);
            }
        );
    });
}

// Compte le nombre total de warns émis par un utilisateur
function countWarnsGiven(warnedBy, groupId) {
    if (!sqlite3) {
        const data = readJsonDatabase();
        return Promise.resolve(data.warns.filter(row => row.warned_by === warnedBy && row.group_id === groupId).length);
    }

    return new Promise((resolve, reject) => {
        const db = getDatabase();
        db.get(
            'SELECT COUNT(*) as count FROM warns WHERE warned_by = ? AND group_id = ?',
            [warnedBy, groupId],
            (err, row) => {
                if (err) reject(err);
                else resolve(row.count);
            }
        );
    });
}

// Compte le nombre de warns reçus par un utilisateur
function countWarnsReceived(userId, groupId) {
    if (!sqlite3) {
        const data = readJsonDatabase();
        return Promise.resolve(data.warns.filter(row => row.user_id === userId && row.group_id === groupId).length);
    }

    return new Promise((resolve, reject) => {
        const db = getDatabase();
        db.get(
            'SELECT COUNT(*) as count FROM warns WHERE user_id = ? AND group_id = ?',
            [userId, groupId],
            (err, row) => {
                if (err) reject(err);
                else resolve(row.count);
            }
        );
    });
}

// Ajouter un warn avec vérification des limites
async function addCommunityWarn(targetId, groupId, reason, warnedBy) {
    const settings = require('../settings');
    const maxWarnsGiven = settings.warnLimits?.maxGiven || 3;
    const maxWarnsReceived = settings.warnLimits?.maxReceived || 3;
    
    // Vérifie si l'émetteur a déjà warn cette cible
    const alreadyWarned = await hasWarned(warnedBy, targetId, groupId);
    if (alreadyWarned) {
        return { success: false, reason: 'already_warned', message: 'Vous avez déjà averti ce membre' };
    }
    
    // Vérifie les limites de l'émetteur
    const givenCount = await countWarnsGiven(warnedBy, groupId);
    if (givenCount >= maxWarnsGiven) {
        return { success: false, reason: 'giver_limit', message: `Vous avez atteint votre limite de ${maxWarnsGiven} avertissements` };
    }
    
    // Vérifie les limites de la cible
    const receivedCount = await countWarnsReceived(targetId, groupId);
    if (receivedCount >= maxWarnsReceived) {
        return { success: false, reason: 'receiver_limit', message: `Ce membre a déjà atteint ${maxWarnsReceived} avertissements` };
    }
    
    // Ajoute le warn
    if (!sqlite3) {
        const data = readJsonDatabase();
        data.users[targetId] = data.users[targetId] || {
            id: targetId,
            name: targetId.split('@')[0],
            warns: 0,
            banned: 0,
            exp: 0,
            level: 1,
            last_seen: null
        };
        data.users[targetId].warns += 1;
        data.users[targetId].last_seen = nowIso();
        data.warns.push({
            id: Date.now(),
            user_id: targetId,
            group_id: groupId,
            reason,
            warned_by: warnedBy,
            created_at: nowIso()
        });
        writeJsonDatabase(data);
        return {
            success: true,
            warnCount: data.users[targetId].warns,
            remainingGiver: maxWarnsGiven - givenCount - 1,
            remainingReceiver: maxWarnsReceived - receivedCount - 1
        };
    }

    const db = getDatabase();
    return new Promise((resolve, reject) => {
        db.run('INSERT OR IGNORE INTO users (id, name, warns) VALUES (?, ?, 0)', 
            [targetId, targetId.split('@')[0]], function(err) {
            if (err) return reject(err);
            
            db.run('UPDATE users SET warns = warns + 1, last_seen = CURRENT_TIMESTAMP WHERE id = ?', 
                [targetId], function(err) {
                if (err) return reject(err);
                
                db.run('INSERT INTO warns (user_id, group_id, reason, warned_by) VALUES (?, ?, ?, ?)',
                    [targetId, groupId, reason, warnedBy], function(err) {
                        if (err) return reject(err);
                        
                        db.get('SELECT warns FROM users WHERE id = ?', [targetId], (err, row) => {
                            if (err) return reject(err);
                            resolve({ 
                                success: true, 
                                warnCount: row?.warns || 1,
                                remainingGiver: maxWarnsGiven - givenCount - 1,
                                remainingReceiver: maxWarnsReceived - receivedCount - 1
                            });
                        });
                    });
            });
        });
    });
}

// Réinitialiser les warns d'un utilisateur
function resetUserWarns(userId, groupId) {
    return clearWarns(userId, groupId);
}

// Obtenir les statistiques de warn d'un utilisateur
function getWarnStats(userId, groupId) {
    return new Promise(async (resolve, reject) => {
        try {
            const received = await countWarnsReceived(userId, groupId);
            const given = await countWarnsGiven(userId, groupId);
            resolve({ received, given });
        } catch (err) {
            reject(err);
        }
    });
}

function flagMarabout(userId, groupId, reason = '') {
    if (!sqlite3) {
        const data = readJsonDatabase();
        const index = data.marabout_flags.findIndex(row => row.group_id === groupId && row.user_id === userId);
        const row = { group_id: groupId, user_id: userId, reason, created_at: nowIso() };
        if (index >= 0) data.marabout_flags[index] = row;
        else data.marabout_flags.push(row);
        writeJsonDatabase(data);
        return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
        const db = getDatabase();
        db.run(
            `INSERT OR REPLACE INTO marabout_flags (group_id, user_id, reason, created_at)
             VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
            [groupId, userId, reason],
            (err) => err ? reject(err) : resolve()
        );
    });
}

function isFlaggedMarabout(userId, groupId) {
    if (!sqlite3) {
        const data = readJsonDatabase();
        return Promise.resolve(data.marabout_flags.find(row => row.group_id === groupId && row.user_id === userId) || null);
    }

    return new Promise((resolve, reject) => {
        const db = getDatabase();
        db.get(
            'SELECT reason FROM marabout_flags WHERE group_id = ? AND user_id = ?',
            [groupId, userId],
            (err, row) => err ? reject(err) : resolve(row || null)
        );
    });
}

function unflagMarabout(userId, groupId) {
    if (!sqlite3) {
        const data = readJsonDatabase();
        const before = data.marabout_flags.length;
        data.marabout_flags = data.marabout_flags.filter(row => !(row.group_id === groupId && row.user_id === userId));
        writeJsonDatabase(data);
        return Promise.resolve(before - data.marabout_flags.length);
    }

    return new Promise((resolve, reject) => {
        const db = getDatabase();
        db.run(
            'DELETE FROM marabout_flags WHERE group_id = ? AND user_id = ?',
            [groupId, userId],
            function(err) {
                if (err) reject(err);
                else resolve(this.changes || 0);
            }
        );
    });
}

function clearMaraboutFlagsForUsers(userIds, groupId) {
    if (!Array.isArray(userIds) || userIds.length === 0) return Promise.resolve(0);

    return Promise.all(userIds.map(userId => unflagMarabout(userId, groupId)))
        .then(results => results.reduce((total, count) => total + count, 0));
}

module.exports = { 
    initDatabase, 
    addWarn, 
    getWarns, 
    clearWarns, 
    getDatabase, 
    closeDatabase,
    addCommunityWarn,
    hasWarned,
    countWarnsGiven,
    countWarnsReceived,
    getWarnStats,
    resetUserWarns,
    flagMarabout,
    isFlaggedMarabout,
    unflagMarabout,
    clearMaraboutFlagsForUsers
};
