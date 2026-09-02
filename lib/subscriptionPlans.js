const SUBSCRIPTION_PLANS = {
    starter: {
        code: 'starter',
        amountCfa: 500,
        label: 'Abonnement Starter 500 FCFA',
        aiAgent: false,
        blockedCommands: ['3412', 'agent'],
        limitedDownloadCommands: ['play', 'ytmp3', 'audio', 'musique', 'song', 'ytmp4', 'video', 'pinterest', 'pin', 'pins', 'img']
    },
    downloader: {
        code: 'downloader',
        amountCfa: 1000,
        label: 'Abonnement Pro 1000 FCFA',
        aiAgent: false,
        blockedCommands: ['agent'],
        limitedDownloadCommands: []
    },
    full: {
        code: 'full',
        amountCfa: 2000,
        label: 'Abonnement Elite 2000 FCFA',
        aiAgent: true,
        blockedCommands: [],
        limitedDownloadCommands: []
    }
};

const PLAN_ALIASES = {
    '500': 'starter',
    '500cfa': 'starter',
    starter: 'starter',
    basic: 'starter',
    basique: 'starter',
    limited: 'starter',
    limite: 'starter',
    level1: 'starter',
    '1000': 'downloader',
    '1000cfa': 'downloader',
    downloader: 'downloader',
    pro: 'downloader',
    download: 'downloader',
    telechargement: 'downloader',
    téléchargement: 'downloader',
    premium: 'downloader',
    level2: 'downloader',
    '2000': 'full',
    '2000cfa': 'full',
    full: 'full',
    total: 'full',
    complet: 'full',
    complete: 'full',
    illimite: 'full',
    illimité: 'full',
    level3: 'full'
};

function normalizePlanCode(value = '', fallback = 'full') {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return fallback;

    const cleaned = raw
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, '');

    return PLAN_ALIASES[cleaned] || (SUBSCRIPTION_PLANS[raw] ? raw : fallback);
}

function getSubscriptionPlan(value = 'full') {
    const code = normalizePlanCode(value);
    return SUBSCRIPTION_PLANS[code] || SUBSCRIPTION_PLANS.full;
}

function inferPlanFromAmount(amount, fallback = 'full') {
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount)) return normalizePlanCode(fallback);

    const plan = Object.values(SUBSCRIPTION_PLANS)
        .find(item => item.amountCfa === numericAmount);

    return plan?.code || normalizePlanCode(fallback);
}

function isCommandBlockedForPlan(commandName, planCode) {
    const plan = getSubscriptionPlan(planCode);
    const name = String(commandName || '').toLowerCase();
    return plan.blockedCommands.includes(name);
}

function isDownloadLimitedForPlan(commandName, planCode) {
    const plan = getSubscriptionPlan(planCode);
    const name = String(commandName || '').toLowerCase();
    return plan.limitedDownloadCommands.includes(name);
}

function canUseAiAgent(planCode) {
    return getSubscriptionPlan(planCode).aiAgent === true;
}

module.exports = {
    SUBSCRIPTION_PLANS,
    normalizePlanCode,
    getSubscriptionPlan,
    inferPlanFromAmount,
    isCommandBlockedForPlan,
    isDownloadLimitedForPlan,
    canUseAiAgent
};
