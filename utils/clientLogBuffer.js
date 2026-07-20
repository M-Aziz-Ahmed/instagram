const MAX_LOGS = 500;

const logs = [];

function pushClientLog(level, msg, meta) {
    logs.push({
        ts: new Date().toISOString(),
        level,
        msg,
        meta: meta || undefined,
    });
    if (logs.length > MAX_LOGS) logs.shift();
}

function getClientLogs({ level, since, limit } = {}) {
    let result = logs;
    if (level) result = result.filter((l) => l.level === level);
    if (since) {
        const d = new Date(since);
        result = result.filter((l) => new Date(l.ts) > d);
    }
    if (limit) result = result.slice(-limit);
    return result;
}

export { pushClientLog, getClientLogs };
