// lib/database.js - Version CORRIGÉE
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, '../data/community.db');

// Singleton pour la base de données
let dbInstance = null;

function getDatabase() {
    if (!dbInstance) {
        const dataDir = path.join(__dirname, '../data');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        dbInstance = new sqlite3.Database(dbPath);
    }
    return dbInstance;
}

function initDatabase() {
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
    const db = getDatabase();
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
