function normalizeSessionText(value = '') {
    return String(value || '').toLowerCase();
}

function isSessionCorrupted(error) {
    const text = normalizeSessionText(error?.stack || error?.message || error || '');

    if (!text) return false;

    return (
        text.includes('bad mac') ||
        text.includes('badmac') ||
        text.includes('session error:error: bad mac') ||
        text.includes('no session record') ||
        text.includes('no session found to decrypt message') ||
        text.includes('failed to decrypt message') ||
        text.includes('failed to decrypt') ||
        text.includes('session error') ||
        text.includes('libsignal') ||
        text.includes('group cipher') ||
        text.includes('assertsessions') ||
        text.includes('not-acceptable')
    );
}

function shouldTriggerSessionRecoveryFromLog(message = '') {
    if (!message) return false;
    const text = normalizeSessionText(message);
    return (
        text.includes('failed to decrypt') ||
        text.includes('no session record') ||
        text.includes('no session found to decrypt message') ||
        text.includes('bad mac') ||
        text.includes('session error') ||
        text.includes('libsignal') ||
        text.includes('group cipher')
    );
}

function shouldRecoverFromDisconnect(statusCode, disconnectMessage = '') {
    const text = normalizeSessionText(`${statusCode || ''} ${disconnectMessage || ''}`);
    if (!text) return false;

    const hasConflict = text.includes('conflict');
    const hasReplaced = text.includes('connection replaced') || text.includes('session replaced') || text.includes('another connection');

    return hasReplaced || (hasConflict && (text.includes('stream') || text.includes('session')));
}

function installSessionLogWatcher({ onRecover, cooldownMs = 15000 } = {}) {
    if (typeof onRecover !== 'function') return () => {};

    let lastTriggeredAt = 0;

    const maybeRecover = (chunk) => {
        if (!chunk) return;
        const lines = String(chunk).split(/\r?\n/);
        for (const line of lines) {
            if (!shouldTriggerSessionRecoveryFromLog(line)) continue;
            const now = Date.now();
            if (now - lastTriggeredAt < cooldownMs) return;
            lastTriggeredAt = now;
            onRecover(line);
            return;
        }
    };

    const originalStdoutWrite = process.stdout.write.bind(process.stdout);
    const originalStderrWrite = process.stderr.write.bind(process.stderr);

    process.stdout.write = (chunk, encoding, callback) => {
        maybeRecover(chunk);
        return originalStdoutWrite(chunk, encoding, callback);
    };

    process.stderr.write = (chunk, encoding, callback) => {
        maybeRecover(chunk);
        return originalStderrWrite(chunk, encoding, callback);
    };

    return () => {
        process.stdout.write = originalStdoutWrite;
        process.stderr.write = originalStderrWrite;
    };
}

module.exports = {
    isSessionCorrupted,
    shouldTriggerSessionRecoveryFromLog,
    shouldRecoverFromDisconnect,
    installSessionLogWatcher
};
