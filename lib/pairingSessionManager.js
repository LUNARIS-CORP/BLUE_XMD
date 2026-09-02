const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const activePairingProcesses = new Map();

function normalizePhone(value = '') {
    return String(value || '').replace(/\D/g, '');
}

function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

function resolveSessionsRoot(sessionsRoot = './pairing-sessions') {
    const root = String(sessionsRoot || './pairing-sessions').trim();
    const resolved = path.resolve(__dirname, '..', root);
    const mainSession = path.resolve(__dirname, '..', process.env.BOT_SESSION_DIR || './session');

    if (resolved === mainSession) {
        return path.resolve(__dirname, '..', './pairing-sessions');
    }

    return resolved;
}

function createClientSessionPaths(phone, sessionsRoot = './pairing-sessions') {
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone || normalizedPhone.length < 10) {
        throw new Error('Numero client invalide');
    }

    const root = resolveSessionsRoot(sessionsRoot);
    const instanceDir = path.join(root, normalizedPhone);
    const sessionDir = path.join(instanceDir, 'session');
    const outputFile = path.join(instanceDir, 'pairing.json');
    const logFile = path.join(instanceDir, 'bot.log');

    ensureDir(instanceDir);
    ensureDir(sessionDir);

    return { normalizedPhone, root, instanceDir, sessionDir, outputFile, logFile };
}

function readJsonFile(filePath) {
    try {
        if (!fs.existsSync(filePath)) return null;
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
        return null;
    }
}

function isRegisteredSession(sessionDir) {
    const creds = readJsonFile(path.join(sessionDir, 'creds.json'));
    return Boolean(creds?.registered);
}

function waitForPairingResult(outputFile, timeoutMs = 120000, childProcess = null) {
    const startedAt = Date.now();

    return new Promise((resolve, reject) => {
        let lastPairingError = null;

        const cleanup = () => {
            clearInterval(timer);
            if (childProcess) {
                childProcess.off('exit', handleExit);
            }
        };

        const handleExit = () => {
            const state = readJsonFile(outputFile);
            if (state?.status === 'pairing_code' && state.code) {
                cleanup();
                resolve(state);
                return;
            }

            cleanup();
            reject(new Error(state?.error || lastPairingError || 'Processus pairing arrete avant reception du code'));
        };

        const timer = setInterval(() => {
            const state = readJsonFile(outputFile);
            if (state?.status === 'pairing_code' && state.code) {
                cleanup();
                resolve(state);
                return;
            }

            if (state?.status === 'connected') {
                cleanup();
                resolve(state);
                return;
            }

            if (state?.status === 'unauthorized_phone') {
                cleanup();
                reject(new Error(state.error || state.status));
                return;
            }

            if (state?.status === 'pairing_error') {
                lastPairingError = state.error || state.status;
            }

            if (Date.now() - startedAt >= timeoutMs) {
                cleanup();
                reject(new Error(lastPairingError || 'Code pairing non recu avant le timeout'));
            }
        }, 1000);

        if (childProcess) {
            childProcess.once('exit', handleExit);
        }
    });
}

function startClientPairingSession(phone, options = {}) {
    const paths = createClientSessionPaths(phone, options.sessionsRoot);
    const existing = activePairingProcesses.get(paths.normalizedPhone);
    const registeredSession = isRegisteredSession(paths.sessionDir);

    if (existing?.process && !existing.process.killed) {
        return { ...paths, reused: true, process: existing.process };
    }

    try {
        fs.writeFileSync(paths.outputFile, JSON.stringify({
            status: registeredSession ? 'starting_registered_session' : 'starting',
            phone: paths.normalizedPhone,
            sessionDir: paths.sessionDir,
            createdAt: new Date().toISOString()
        }, null, 2));
    } catch {}

    const env = {
        ...process.env,
        BOT_SESSION_DIR: paths.sessionDir,
        BOT_PAIRING_OUTPUT_FILE: paths.outputFile,
        BOT_INSTANCE_LABEL: `client-${paths.normalizedPhone}`,
        BOT_DISABLE_INTERACTIVE: '1',
        BOT_DISABLE_LOCK: '1',
        BOT_SKIP_LOGO: '1',
        BOT_DISABLE_OWNER_NOTIFY: '1',
        BOT_CONNECTION_API_ENABLED: '0',
        BOT_FORCE_PUBLIC: options.forcePublic === false ? '0' : '1'
    };

    if (!registeredSession && options.allowPairing !== false) {
        env.BOT_PAIRING_PHONE = paths.normalizedPhone;
    }

    if (options.pairingMaxAttempts) {
        env.BOT_PAIRING_MAX_ATTEMPTS = String(options.pairingMaxAttempts);
    }

    const child = spawn(process.execPath, ['index.js'], {
        cwd: path.resolve(__dirname, '..'),
        env,
        stdio: ['ignore', 'pipe', 'pipe']
    });

    const logStream = fs.createWriteStream(paths.logFile, { flags: 'a' });
    child.stdout.pipe(logStream);
    child.stderr.pipe(logStream);

    child.on('exit', (code, signal) => {
        activePairingProcesses.delete(paths.normalizedPhone);
        try {
            fs.appendFileSync(paths.logFile, `\n[exit] code=${code} signal=${signal || ''}\n`);
        } catch {}
    });

    activePairingProcesses.set(paths.normalizedPhone, {
        process: child,
        startedAt: Date.now(),
        ...paths
    });

    return { ...paths, reused: false, process: child };
}

async function createClientPairingCode(phone, options = {}) {
    const started = startClientPairingSession(phone, options);
    const state = await waitForPairingResult(started.outputFile, options.timeoutMs || 120000, started.process);

    return {
        ...started,
        code: state.code,
        status: state.status,
        createdAt: state.createdAt
    };
}

module.exports = {
    normalizePhone,
    createClientSessionPaths,
    startClientPairingSession,
    createClientPairingCode,
    resolveSessionsRoot
};
