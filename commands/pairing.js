const config = require('../config');
const { createClientPairingCode } = require('../lib/pairingSessionManager');
const {
    isPhoneAuthorized,
    getAuthorizedAccessByPhone,
    normalizePhoneNumber
} = require('../lib/connectionAuth');
const { formatMessage, keyValue, bulletList } = require('../lib/messageStyler');

function ownerPhones() {
    return String(config.ownerJid || '')
        .split(',')
        .map(value => normalizePhoneNumber(value))
        .filter(Boolean);
}

function isOwnerPhone(phone) {
    const normalized = normalizePhoneNumber(phone);
    return ownerPhones().includes(normalized);
}

module.exports = {
    name: 'pairing',
    aliases: ['pair', 'connecter', 'connect'],
    description: 'Genere un code de pairing pour connecter un client',
    ownerOnly: true,
    timeoutMs: Number(process.env.BOT_CLIENT_PAIRING_COMMAND_TIMEOUT_MS || 180000),

    async execute(sock, m, args) {
        const phone = normalizePhoneNumber(args[0] || '');
        if (!phone || phone.length < 10) {
            await sock.sendMessage(m.chat, {
                text: formatMessage(
                    `${keyValue('Usage', `${config.prefix || '.'}pairing 225XXXXXXXX`)}\n` +
                    `${keyValue('Exemple', `${config.prefix || '.'}pairing 2250500065540`)}`,
                    { title: '🔐 PAIRING CLIENT', status: 'warning' }
                )
            });
            return;
        }

        const owner = isOwnerPhone(phone);
        const authorizationRequired = process.env.BOT_PAIRING_AUTH_REQUIRED !== '0';
        const authorized = owner || !authorizationRequired || await isPhoneAuthorized(phone);
        if (!authorized) {
            await sock.sendMessage(m.chat, {
                text: formatMessage(
                    `Le numero ${phone} n'a pas encore d'acces paye. Valide le paiement ou ajoute l'acces avant de generer un pairing.`,
                    { title: '🔒 ACCES REFUSE', status: 'error' }
                )
            });
            return;
        }

        const access = owner ? null : await getAuthorizedAccessByPhone(phone).catch(() => null);
        await sock.sendMessage(m.chat, {
            text: formatMessage(
                `${keyValue('Numero', phone)}\n` +
                `${keyValue('Statut', owner ? 'Owner' : authorizationRequired ? 'Client autorise' : 'Autorisation desactivee')}\n` +
                `${access?.plan_code ? keyValue('Plan', access.plan_code) + '\n' : ''}` +
                'Generation du code en cours...',
                { title: '🔐 PAIRING CLIENT', status: 'info' }
            )
        });

        try {
            const result = await createClientPairingCode(phone, {
                sessionsRoot: process.env.PAIRING_PORTAL_SESSIONS_ROOT || './pairing-sessions',
                timeoutMs: Number(process.env.BOT_CLIENT_PAIRING_TIMEOUT_MS || 120000),
                pairingMaxAttempts: Number(process.env.BOT_PAIRING_MAX_ATTEMPTS || 6)
            });

            if (result.status === 'connected' && !result.code) {
                await sock.sendMessage(m.chat, {
                    text: formatMessage(
                        `${keyValue('Numero', phone)}\n${keyValue('Session', result.sessionDir)}\n${keyValue('Statut', 'deja connectee')}`,
                        { title: '✅ PAIRING CLIENT', status: 'success' }
                    )
                });
                return;
            }

            await sock.sendMessage(m.chat, {
                text: formatMessage(
                    `${keyValue('Numero', phone)}\n` +
                    `${keyValue('Code', result.code)}\n` +
                    `${keyValue('Session', result.sessionDir)}\n\n` +
                    `${bulletList([
                        'Ouvrir WhatsApp sur le telephone du client',
                        'Aller dans Appareils lies',
                        'Cliquer sur Lier un appareil',
                        'Entrer le code ci-dessus'
                    ])}`,
                    { title: '🔑 CODE PAIRING CLIENT', status: 'success', includeFooter: false }
                )
            });
        } catch (err) {
            await sock.sendMessage(m.chat, {
                text: formatMessage(
                    `${keyValue('Numero', phone)}\n${keyValue('Erreur', err.message || 'Generation impossible')}`,
                    { title: '❌ PAIRING ECHEC', status: 'error' }
                )
            });
        }
    }
};
