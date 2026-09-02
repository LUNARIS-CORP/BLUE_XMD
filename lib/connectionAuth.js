const http = require('http');
const path = require('path');
const fs = require('fs');
let sqlite3 = null;
try {
    sqlite3 = require('sqlite3').verbose();
} catch (err) {
    console.warn('sqlite3 indisponible, utilisation du stockage JSON pour les autorisations de connexion.');
}
const {
    getSubscriptionPlan,
    inferPlanFromAmount,
    normalizePlanCode
} = require('./subscriptionPlans');

const dbPath = path.join(__dirname, '../data/connection-auth.db');
const jsonDbPath = path.join(__dirname, '../data/connection-auth.json');
let dbInstance = null;

function normalizePhoneNumber(value = '') {
    return String(value || '').replace(/\D/g, '');
}

function ensureDataDir() {
    const dataDir = path.join(__dirname, '../data');
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }
}

function defaultJsonDatabase() {
    return {
        authorized_phones: {},
        pending_access_requests: [],
        access_logs: [],
        subscription_usage: {}
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
        console.error('Erreur lecture connection-auth.json:', err.message);
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

function isActiveAccess(row) {
    return Boolean(row && (!row.expires_at || new Date(row.expires_at).getTime() > Date.now()));
}

function getDatabase() {
    if (!sqlite3) return null;
    if (!dbInstance) {
        ensureDataDir();
        dbInstance = new sqlite3.Database(dbPath);
    }
    return dbInstance;
}

function initConnectionAuthDatabase() {
    if (!sqlite3) {
        writeJsonDatabase(readJsonDatabase());
        return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
        const db = getDatabase();
        db.serialize(() => {
            db.run(`CREATE TABLE IF NOT EXISTS authorized_phones (
                phone TEXT PRIMARY KEY,
                approved_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                expires_at DATETIME,
                approved_by TEXT,
                plan_code TEXT DEFAULT 'full',
                amount_cfa INTEGER DEFAULT 2000,
                metadata TEXT DEFAULT '{}'
            )`, (err) => {
                if (err) return reject(err);
            });

            db.run(`CREATE TABLE IF NOT EXISTS pending_access_requests (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                phone TEXT NOT NULL,
                user_id TEXT,
                email TEXT,
                payment_ref TEXT,
                plan_code TEXT DEFAULT 'full',
                amount_cfa INTEGER DEFAULT 2000,
                metadata TEXT DEFAULT '{}',
                status TEXT DEFAULT 'pending',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`, (err) => {
                if (err) return reject(err);
            });

            db.run(`CREATE TABLE IF NOT EXISTS access_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_type TEXT NOT NULL,
                phone TEXT,
                details TEXT DEFAULT '{}',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`, (err) => {
                if (err) return reject(err);
            });

            db.run(`CREATE TABLE IF NOT EXISTS subscription_usage (
                phone TEXT NOT NULL,
                usage_date TEXT NOT NULL,
                command_name TEXT NOT NULL,
                used_count INTEGER DEFAULT 0,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (phone, usage_date, command_name)
            )`, (err) => {
                if (err) return reject(err);
            });

            ensureColumn(db, 'authorized_phones', 'plan_code', "TEXT DEFAULT 'full'", reject);
            ensureColumn(db, 'authorized_phones', 'amount_cfa', 'INTEGER DEFAULT 2000', reject);
            ensureColumn(db, 'pending_access_requests', 'plan_code', "TEXT DEFAULT 'full'", reject);
            ensureColumn(db, 'pending_access_requests', 'amount_cfa', 'INTEGER DEFAULT 2000', reject);

            db.run('UPDATE authorized_phones SET plan_code = COALESCE(plan_code, ?), amount_cfa = COALESCE(amount_cfa, ?) WHERE plan_code IS NULL OR amount_cfa IS NULL', ['full', 2000], (err) => {
                if (err) return reject(err);
                resolve();
            });
        });
    });
}

function ensureColumn(db, tableName, columnName, definition, reject) {
    db.run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`, (err) => {
        if (err && !String(err.message || '').includes('duplicate column')) {
            reject(err);
        }
    });
}

function logAccessEvent(eventType, phone = '', details = {}) {
    if (!sqlite3) {
        const data = readJsonDatabase();
        const id = data.access_logs.length ? Math.max(...data.access_logs.map(row => Number(row.id) || 0)) + 1 : 1;
        data.access_logs.push({
            id,
            event_type: eventType,
            phone: normalizePhoneNumber(phone),
            details: JSON.stringify(details || {}),
            created_at: nowIso()
        });
        writeJsonDatabase(data);
        return Promise.resolve(id);
    }

    return new Promise((resolve, reject) => {
        const db = getDatabase();
        db.run(
            `INSERT INTO access_logs (event_type, phone, details) VALUES (?, ?, ?)`,
            [eventType, normalizePhoneNumber(phone), JSON.stringify(details || {})],
            function (err) {
                if (err) return reject(err);
                resolve(this.lastID);
            }
        );
    });
}

function addPendingAccessRequest({ phone, userId, email, paymentRef, planCode, amountCfa, metadata }) {
    if (!sqlite3) {
        const normalizedPhone = normalizePhoneNumber(phone);
        if (!normalizedPhone) {
            return Promise.reject(new Error('Numéro de téléphone invalide'));
        }
        const normalizedPlanCode = normalizePlanCode(planCode || inferPlanFromAmount(amountCfa, 'full'));
        const plan = getSubscriptionPlan(normalizedPlanCode);
        const normalizedAmountCfa = Number.isFinite(Number(amountCfa)) ? Number(amountCfa) : plan.amountCfa;
        const data = readJsonDatabase();
        const id = data.pending_access_requests.length ? Math.max(...data.pending_access_requests.map(row => Number(row.id) || 0)) + 1 : 1;
        const row = {
            id,
            phone: normalizedPhone,
            user_id: userId || null,
            email: email || null,
            payment_ref: paymentRef || null,
            plan_code: normalizedPlanCode,
            amount_cfa: normalizedAmountCfa,
            metadata: JSON.stringify(metadata || {}),
            status: 'pending',
            created_at: nowIso(),
            updated_at: nowIso()
        };
        data.pending_access_requests.push(row);
        writeJsonDatabase(data);
        logAccessEvent('pending_request_created', normalizedPhone, { userId, email, paymentRef, planCode: normalizedPlanCode, amountCfa: normalizedAmountCfa, id }).catch(() => {});
        return Promise.resolve({ id, phone: normalizedPhone, userId, email, paymentRef, planCode: normalizedPlanCode, amountCfa: normalizedAmountCfa, metadata: metadata || {}, status: 'pending' });
    }

    return new Promise((resolve, reject) => {
        const normalizedPhone = normalizePhoneNumber(phone);
        if (!normalizedPhone) {
            return reject(new Error('Numéro de téléphone invalide')); 
        }
        const normalizedPlanCode = normalizePlanCode(planCode || inferPlanFromAmount(amountCfa, 'full'));
        const plan = getSubscriptionPlan(normalizedPlanCode);
        const normalizedAmountCfa = Number.isFinite(Number(amountCfa)) ? Number(amountCfa) : plan.amountCfa;

        const db = getDatabase();
        db.run(
            `INSERT INTO pending_access_requests (phone, user_id, email, payment_ref, plan_code, amount_cfa, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [normalizedPhone, userId || null, email || null, paymentRef || null, normalizedPlanCode, normalizedAmountCfa, JSON.stringify(metadata || {})],
            function (err) {
                if (err) return reject(err);
                logAccessEvent('pending_request_created', normalizedPhone, { userId, email, paymentRef, planCode: normalizedPlanCode, amountCfa: normalizedAmountCfa, id: this.lastID }).catch(() => {});
                resolve({ id: this.lastID, phone: normalizedPhone, userId, email, paymentRef, planCode: normalizedPlanCode, amountCfa: normalizedAmountCfa, metadata: metadata || {}, status: 'pending' });
            }
        );
    });
}

function listPendingAccessRequests() {
    if (!sqlite3) {
        const data = readJsonDatabase();
        return Promise.resolve([...data.pending_access_requests].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))));
    }

    return new Promise((resolve, reject) => {
        const db = getDatabase();
        db.all(`SELECT * FROM pending_access_requests ORDER BY created_at DESC`, [], (err, rows) => {
            if (err) return reject(err);
            resolve(rows || []);
        });
    });
}

function getPendingAccessRequestByPhone(phone) {
    if (!sqlite3) {
        const normalizedPhone = normalizePhoneNumber(phone);
        const data = readJsonDatabase();
        const row = [...data.pending_access_requests]
            .filter(item => item.phone === normalizedPhone)
            .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
        return Promise.resolve(row || null);
    }

    return new Promise((resolve, reject) => {
        const db = getDatabase();
        db.get(`SELECT * FROM pending_access_requests WHERE phone = ? ORDER BY created_at DESC LIMIT 1`, [normalizePhoneNumber(phone)], (err, row) => {
            if (err) return reject(err);
            resolve(row || null);
        });
    });
}

function approveAccessRequest({ phone, approvedBy = null, expiresInDays = 30, planCode = null, amountCfa = null }) {
    if (!sqlite3) {
        const normalizedPhone = normalizePhoneNumber(phone);
        if (!normalizedPhone) return Promise.reject(new Error('Numéro de téléphone invalide'));

        const data = readJsonDatabase();
        const pendingRequest = [...data.pending_access_requests]
            .filter(item => item.phone === normalizedPhone)
            .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
        const normalizedPlanCode = normalizePlanCode(planCode || pendingRequest?.plan_code || inferPlanFromAmount(amountCfa || pendingRequest?.amount_cfa, 'full'));
        const plan = getSubscriptionPlan(normalizedPlanCode);
        const normalizedAmountCfa = Number.isFinite(Number(amountCfa))
            ? Number(amountCfa)
            : Number.isFinite(Number(pendingRequest?.amount_cfa))
                ? Number(pendingRequest.amount_cfa)
                : plan.amountCfa;
        const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();

        data.authorized_phones[normalizedPhone] = {
            phone: normalizedPhone,
            approved_at: nowIso(),
            expires_at: expiresAt,
            approved_by: approvedBy || null,
            plan_code: normalizedPlanCode,
            amount_cfa: normalizedAmountCfa,
            metadata: data.authorized_phones[normalizedPhone]?.metadata || '{}'
        };
        data.pending_access_requests = data.pending_access_requests.map(item =>
            item.phone === normalizedPhone && item.status !== 'approved'
                ? { ...item, status: 'approved', updated_at: nowIso() }
                : item
        );
        writeJsonDatabase(data);
        logAccessEvent('access_approved', normalizedPhone, { approvedBy, expiresAt, planCode: normalizedPlanCode, amountCfa: normalizedAmountCfa }).catch(() => {});
        return Promise.resolve({ phone: normalizedPhone, approvedBy, expiresAt, planCode: normalizedPlanCode, amountCfa: normalizedAmountCfa });
    }

    return new Promise((resolve, reject) => {
        const normalizedPhone = normalizePhoneNumber(phone);
        if (!normalizedPhone) return reject(new Error('Numéro de téléphone invalide'));

        const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();
        const db = getDatabase();

        getPendingAccessRequestByPhone(normalizedPhone)
            .then((pendingRequest) => {
                const normalizedPlanCode = normalizePlanCode(planCode || pendingRequest?.plan_code || inferPlanFromAmount(amountCfa || pendingRequest?.amount_cfa, 'full'));
                const plan = getSubscriptionPlan(normalizedPlanCode);
                const normalizedAmountCfa = Number.isFinite(Number(amountCfa))
                    ? Number(amountCfa)
                    : Number.isFinite(Number(pendingRequest?.amount_cfa))
                        ? Number(pendingRequest.amount_cfa)
                        : plan.amountCfa;

                db.serialize(() => {
                    db.run(
                        `INSERT INTO authorized_phones (phone, approved_at, expires_at, approved_by, plan_code, amount_cfa) VALUES (?, CURRENT_TIMESTAMP, ?, ?, ?, ?)
                        ON CONFLICT(phone) DO UPDATE SET approved_at = CURRENT_TIMESTAMP, expires_at = excluded.expires_at, approved_by = excluded.approved_by, plan_code = excluded.plan_code, amount_cfa = excluded.amount_cfa`,
                        [normalizedPhone, expiresAt, approvedBy || null, normalizedPlanCode, normalizedAmountCfa],
                        function (err) {
                            if (err) return reject(err);
                        }
                    );

                    db.run(
                        `UPDATE pending_access_requests SET status = 'approved', updated_at = CURRENT_TIMESTAMP WHERE phone = ? AND status != 'approved'`,
                        [normalizedPhone],
                        function (err) {
                            if (err) return reject(err);
                            logAccessEvent('access_approved', normalizedPhone, { approvedBy, expiresAt, planCode: normalizedPlanCode, amountCfa: normalizedAmountCfa }).catch(() => {});
                            resolve({ phone: normalizedPhone, approvedBy, expiresAt, planCode: normalizedPlanCode, amountCfa: normalizedAmountCfa });
                        }
                    );
                });
            })
            .catch(reject);
    });
}

function revokeAuthorizedPhone(phone) {
    if (!sqlite3) {
        const normalizedPhone = normalizePhoneNumber(phone);
        if (!normalizedPhone) return Promise.reject(new Error('Numéro de téléphone invalide'));
        const data = readJsonDatabase();
        const revoked = Boolean(data.authorized_phones[normalizedPhone]);
        delete data.authorized_phones[normalizedPhone];
        writeJsonDatabase(data);
        logAccessEvent('access_revoked', normalizedPhone, {}).catch(() => {});
        return Promise.resolve(revoked);
    }

    return new Promise((resolve, reject) => {
        const normalizedPhone = normalizePhoneNumber(phone);
        if (!normalizedPhone) return reject(new Error('Numéro de téléphone invalide'));

        const db = getDatabase();
        db.run(
            `DELETE FROM authorized_phones WHERE phone = ?`,
            [normalizedPhone],
            function (err) {
                if (err) return reject(err);
                logAccessEvent('access_revoked', normalizedPhone, {}).catch(() => {});
                resolve(this.changes > 0);
            }
        );
    });
}

function listAuthorizedPhones() {
    if (!sqlite3) {
        const data = readJsonDatabase();
        const rows = Object.values(data.authorized_phones)
            .filter(isActiveAccess)
            .sort((a, b) => String(b.approved_at).localeCompare(String(a.approved_at)));
        return Promise.resolve(rows);
    }

    return new Promise((resolve, reject) => {
        const db = getDatabase();
        db.all(
            `SELECT phone, approved_at, expires_at, approved_by, plan_code, amount_cfa, metadata FROM authorized_phones WHERE expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP ORDER BY approved_at DESC`,
            [],
            (err, rows) => {
                if (err) return reject(err);
                resolve(rows || []);
            }
        );
    });
}

function getAuthorizedAccessByPhone(phone) {
    if (!sqlite3) {
        const data = readJsonDatabase();
        const row = data.authorized_phones[normalizePhoneNumber(phone)];
        return Promise.resolve(isActiveAccess(row) ? row : null);
    }

    return new Promise((resolve, reject) => {
        const db = getDatabase();
        db.get(
            `SELECT phone, approved_at, expires_at, approved_by, plan_code, amount_cfa, metadata
             FROM authorized_phones
             WHERE phone = ? AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
             LIMIT 1`,
            [normalizePhoneNumber(phone)],
            (err, row) => {
                if (err) return reject(err);
                resolve(row || null);
            }
        );
    });
}

function getExpiringSubscriptions(hours = 48) {
    if (!sqlite3) {
        const maxTime = Date.now() + Number(hours || 48) * 60 * 60 * 1000;
        const data = readJsonDatabase();
        const rows = Object.values(data.authorized_phones).filter(row => {
            if (!row.expires_at) return false;
            const expiresAt = new Date(row.expires_at).getTime();
            if (!(expiresAt > Date.now() && expiresAt <= maxTime)) return false;
            try {
                return !JSON.parse(row.metadata || '{}').expiration_notified;
            } catch (e) {
                return true;
            }
        });
        return Promise.resolve(rows);
    }

    return new Promise((resolve, reject) => {
        const db = getDatabase();
        db.all(
            `SELECT phone, expires_at, metadata FROM authorized_phones 
             WHERE expires_at > CURRENT_TIMESTAMP 
             AND expires_at <= datetime(CURRENT_TIMESTAMP, '+' || ? || ' hours')`,
            [hours],
            (err, rows) => {
                if (err) return reject(err);
                const toNotify = rows.filter(row => {
                    try {
                        const meta = JSON.parse(row.metadata || '{}');
                        return !meta.expiration_notified;
                    } catch (e) {
                        return true;
                    }
                });
                resolve(toNotify || []);
            }
        );
    });
}

function markExpirationNotified(phone) {
    if (!sqlite3) {
        const normalizedPhone = normalizePhoneNumber(phone);
        const data = readJsonDatabase();
        const row = data.authorized_phones[normalizedPhone];
        if (!row) return Promise.resolve(false);
        let meta = {};
        try { meta = JSON.parse(row.metadata || '{}'); } catch(e) {}
        meta.expiration_notified = true;
        row.metadata = JSON.stringify(meta);
        writeJsonDatabase(data);
        return Promise.resolve(true);
    }

    return new Promise((resolve, reject) => {
        const db = getDatabase();
        const normalizedPhone = normalizePhoneNumber(phone);
        db.get(`SELECT metadata FROM authorized_phones WHERE phone = ?`, [normalizedPhone], (err, row) => {
            if (err) return reject(err);
            if (!row) return resolve(false);
            
            let meta = {};
            try { meta = JSON.parse(row.metadata || '{}'); } catch(e) {}
            meta.expiration_notified = true;
            
            db.run(`UPDATE authorized_phones SET metadata = ? WHERE phone = ?`, [JSON.stringify(meta), normalizedPhone], function(err) {
                if (err) return reject(err);
                resolve(this.changes > 0);
            });
        });
    });
}

function isPhoneAuthorized(phone) {
    if (!sqlite3) {
        const data = readJsonDatabase();
        return Promise.resolve(isActiveAccess(data.authorized_phones[normalizePhoneNumber(phone)]));
    }

    return new Promise((resolve, reject) => {
        const db = getDatabase();
        db.get(
            `SELECT COUNT(1) as count FROM authorized_phones WHERE phone = ? AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)`,
            [normalizePhoneNumber(phone)],
            (err, row) => {
                if (err) return reject(err);
                resolve(row?.count > 0);
            }
        );
    });
}

function consumeSubscriptionUsage({ phone, commandName, limit, usageDate = null }) {
    if (!sqlite3) {
        const normalizedPhone = normalizePhoneNumber(phone);
        const normalizedCommand = String(commandName || '').trim().toLowerCase();
        const max = Math.max(0, Number(limit || 0));
        const date = usageDate || new Date().toISOString().slice(0, 10);

        if (!normalizedPhone) return Promise.reject(new Error('Numéro de téléphone invalide'));
        if (!normalizedCommand) return Promise.reject(new Error('Commande invalide'));

        const data = readJsonDatabase();
        const key = `${normalizedPhone}:${date}:${normalizedCommand}`;
        const row = data.subscription_usage[key] || {
            phone: normalizedPhone,
            usage_date: date,
            command_name: normalizedCommand,
            used_count: 0,
            updated_at: nowIso()
        };
        const used = Number(row.used_count || 0);
        if (used >= max) {
            return Promise.resolve({ allowed: false, used, remaining: 0, limit: max, usageDate: date });
        }
        row.used_count = used + 1;
        row.updated_at = nowIso();
        data.subscription_usage[key] = row;
        writeJsonDatabase(data);
        return Promise.resolve({ allowed: true, used: row.used_count, remaining: Math.max(0, max - row.used_count), limit: max, usageDate: date });
    }

    return new Promise((resolve, reject) => {
        const normalizedPhone = normalizePhoneNumber(phone);
        const normalizedCommand = String(commandName || '').trim().toLowerCase();
        const max = Math.max(0, Number(limit || 0));
        const date = usageDate || new Date().toISOString().slice(0, 10);

        if (!normalizedPhone) return reject(new Error('Numéro de téléphone invalide'));
        if (!normalizedCommand) return reject(new Error('Commande invalide'));

        const db = getDatabase();
        db.serialize(() => {
            db.get(
                `SELECT used_count FROM subscription_usage WHERE phone = ? AND usage_date = ? AND command_name = ?`,
                [normalizedPhone, date, normalizedCommand],
                (readErr, row) => {
                    if (readErr) return reject(readErr);
                    const used = Number(row?.used_count || 0);
                    if (used >= max) {
                        return resolve({ allowed: false, used, remaining: 0, limit: max, usageDate: date });
                    }

                    db.run(
                        `INSERT INTO subscription_usage (phone, usage_date, command_name, used_count, updated_at)
                         VALUES (?, ?, ?, 1, CURRENT_TIMESTAMP)
                         ON CONFLICT(phone, usage_date, command_name)
                         DO UPDATE SET used_count = used_count + 1, updated_at = CURRENT_TIMESTAMP`,
                        [normalizedPhone, date, normalizedCommand],
                        (writeErr) => {
                            if (writeErr) return reject(writeErr);
                            const nextUsed = used + 1;
                            resolve({ allowed: true, used: nextUsed, remaining: Math.max(0, max - nextUsed), limit: max, usageDate: date });
                        }
                    );
                }
            );
        });
    });
}

function createConnectionAuthApiServer({ host, port, connectionApiKey, adminApiKey, autoApproveOnPayment, createPairingCode, onPendingRequest }) {
    const server = http.createServer(async (req, res) => {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const pathName = url.pathname.replace(/\/+$/, '');

        function sendJson(statusCode, body) {
            const payload = JSON.stringify(body || {});
            res.writeHead(statusCode, {
                'Content-Type': 'application/json; charset=utf-8',
                'Cache-Control': 'no-store',
            });
            res.end(payload);
        }

        function getBearerToken() {
            const header = req.headers.authorization || '';
            const [, token] = header.split(' ');
            return token?.trim();
        }

        let body = null;
        if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
            try {
                body = await new Promise((resolve, reject) => {
                    let data = '';
                    req.on('data', chunk => { data += chunk; });
                    req.on('end', () => {
                        if (!data) return resolve({});
                        try {
                            resolve(JSON.parse(data));
                        } catch (e) {
                            reject(new Error('Payload JSON invalide')); 
                        }
                    });
                    req.on('error', reject);
                });
            } catch (err) {
                return sendJson(400, { error: err.message });
            }
        }

        if (pathName === '/api/health' && req.method === 'GET') {
            return sendJson(200, { status: 'ok', enabled: Boolean(connectionApiKey && adminApiKey) });
        }

        if (!connectionApiKey || !adminApiKey) {
            return sendJson(503, { error: 'Configuration de l’API de connexion manquante' });
        }

        const token = getBearerToken();
        const isAdmin = token === adminApiKey;
        const isConnectionClient = token === connectionApiKey;

        if (pathName === '/api/connection/request-access' && req.method === 'POST') {
            if (!isConnectionClient) {
                return sendJson(401, { error: 'Clé API invalide' });
            }
            const { phone, userId, email, paymentRef, planCode, plan, amountCfa, amount, metadata } = body || {};
            if (!phone) {
                return sendJson(400, { error: 'Le champ phone est requis' });
            }
            try {
                const request = await addPendingAccessRequest({ phone, userId, email, paymentRef, planCode: planCode || plan, amountCfa: amountCfa || amount, metadata });
                if (onPendingRequest) {
                    setImmediate(() => onPendingRequest(request));
                }
                if (autoApproveOnPayment) {
                    await approveAccessRequest({ phone, approvedBy: 'auto', expiresInDays: 30, planCode: request.planCode, amountCfa: request.amountCfa });
                }
                return sendJson(201, { ok: true, request, autoApproved: Boolean(autoApproveOnPayment) });
            } catch (err) {
                return sendJson(500, { error: err.message });
            }
        }

        if (pathName === '/api/connection/pairing-code' && req.method === 'POST') {
            if (!isConnectionClient && !isAdmin) {
                return sendJson(401, { error: 'Clé API invalide' });
            }

            if (typeof createPairingCode !== 'function') {
                return sendJson(503, { error: 'Generation de pairing non disponible' });
            }

            const { phone } = body || {};
            const normalizedPhone = normalizePhoneNumber(phone);
            if (!normalizedPhone) {
                return sendJson(400, { error: 'Le champ phone est requis' });
            }

            try {
                const authorized = await isPhoneAuthorized(normalizedPhone);
                if (!authorized && !isAdmin) {
                    return sendJson(403, { error: 'Numero non autorise pour le pairing' });
                }

                const result = await createPairingCode(normalizedPhone);
                return sendJson(201, {
                    ok: true,
                    phone: normalizedPhone,
                    code: result.code,
                    sessionDir: result.sessionDir,
                    createdAt: result.createdAt
                });
            } catch (err) {
                return sendJson(500, { error: err.message });
            }
        }

        if (!isAdmin) {
            return sendJson(401, { error: 'Clé API admin requise' });
        }

        if (pathName === '/api/connection/pending-requests' && req.method === 'GET') {
            try {
                const requests = await listPendingAccessRequests();
                return sendJson(200, { requests });
            } catch (err) {
                return sendJson(500, { error: err.message });
            }
        }

        if (pathName === '/api/connection/authorized-phones' && req.method === 'GET') {
            try {
                const phones = await listAuthorizedPhones();
                return sendJson(200, { phones });
            } catch (err) {
                return sendJson(500, { error: err.message });
            }
        }

        if (pathName === '/api/connection/approve-access' && req.method === 'POST') {
            const { phone, expiresInDays, planCode, plan, amountCfa, amount } = body || {};
            if (!phone) {
                return sendJson(400, { error: 'Le champ phone est requis' });
            }
            try {
                const result = await approveAccessRequest({
                    phone,
                    approvedBy: 'admin',
                    expiresInDays: Number.isFinite(Number(expiresInDays)) ? Number(expiresInDays) : 30,
                    planCode: planCode || plan,
                    amountCfa: amountCfa || amount
                });
                return sendJson(200, { ok: true, authorized: result });
            } catch (err) {
                return sendJson(500, { error: err.message });
            }
        }

        if (pathName === '/api/connection/revoke-access' && req.method === 'POST') {
            const { phone } = body || {};
            if (!phone) {
                return sendJson(400, { error: 'Le champ phone est requis' });
            }
            try {
                const revoked = await revokeAuthorizedPhone(phone);
                return sendJson(200, { ok: true, revoked });
            } catch (err) {
                return sendJson(500, { error: err.message });
            }
        }

        if (pathName === '/api/connection/phone-status' && req.method === 'GET') {
            const phone = url.searchParams.get('phone');
            if (!phone) {
                return sendJson(400, { error: 'Paramètre phone requis' });
            }
            try {
                const authorized = await isPhoneAuthorized(phone);
                const access = authorized ? await getAuthorizedAccessByPhone(phone) : null;
                return sendJson(200, { phone: normalizePhoneNumber(phone), authorized, access });
            } catch (err) {
                return sendJson(500, { error: err.message });
            }
        }

        sendJson(404, { error: 'Ressource introuvable' });
    });

    server.listen(port, host, () => {
        console.log(`🔐 API de connexion démarrée sur http://${host}:${port}`);
    });

    return server;
}

module.exports = {
    normalizePhoneNumber,
    initConnectionAuthDatabase,
    addPendingAccessRequest,
    listPendingAccessRequests,
    approveAccessRequest,
    revokeAuthorizedPhone,
    listAuthorizedPhones,
    getAuthorizedAccessByPhone,
    isPhoneAuthorized,
    consumeSubscriptionUsage,
    createConnectionAuthApiServer,
    getExpiringSubscriptions,
    markExpirationNotified,
};
