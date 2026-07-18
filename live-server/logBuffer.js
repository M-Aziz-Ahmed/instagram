const MAX_LOGS = 500;

const logs = [];

function pushLog(level, args) {
    logs.push({
        ts: new Date().toISOString(),
        level,
        msg: args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "),
    });
    if (logs.length > MAX_LOGS) logs.shift();
}

const origLog = console.log.bind(console);
const origWarn = console.warn.bind(console);
const origError = console.error.bind(console);

console.log = (...args) => { pushLog("info", args); origLog(...args); };
console.warn = (...args) => { pushLog("warn", args); origWarn(...args); };
console.error = (...args) => { pushLog("error", args); origError(...args); };

function getLogs({ level, since, limit } = {}) {
    let result = logs;
    if (level) result = result.filter((l) => l.level === level);
    if (since) {
        const d = new Date(since);
        result = result.filter((l) => new Date(l.ts) > d);
    }
    if (limit) result = result.slice(-limit);
    return result;
}

module.exports = { getLogs };
