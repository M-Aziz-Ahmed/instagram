const fs = require("fs");
const path = require("path");
const SystemLog = require("./models/systemLog");

const LOG_CATEGORIES = ["frontend", "database", "server", "games", "users", "chats", "auth", "moderation", "system"];
const LOG_LEVELS = ["info", "warn", "error", "debug"];

const BATCH_SIZE = 20;
const FLUSH_INTERVAL_MS = 3000;

const LOG_DIR = path.join(__dirname, "logs");
const LOG_FILE = path.join(LOG_DIR, "system.log");
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_FILES = 5;

let logQueue = [];
let fileQueue = [];
let flushTimer = null;

function ensureLogDir() {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
}

function rotateIfNeeded() {
    ensureLogDir();
    try {
        const stat = fs.statSync(LOG_FILE);
        if (stat.size < MAX_FILE_BYTES) return;
    } catch { return; }
    try {
        const oldest = `${LOG_FILE}.${MAX_FILES}`;
        if (fs.existsSync(oldest)) fs.unlinkSync(oldest);
        for (let i = MAX_FILES - 1; i >= 1; i--) {
            const from = `${LOG_FILE}.${i}`;
            if (fs.existsSync(from)) fs.renameSync(from, `${LOG_FILE}.${i + 1}`);
        }
        fs.renameSync(LOG_FILE, `${LOG_FILE}.1`);
    } catch {}
}

function writeFileQueue() {
    if (fileQueue.length === 0) return;
    ensureLogDir();
    rotateIfNeeded();
    const lines = fileQueue.splice(0).join("\n") + "\n";
    try {
        fs.appendFileSync(LOG_FILE, lines);
    } catch (err) {
        console.error("[LogService] File write failed:", err.message);
    }
}

function flushLogs() {
    writeFileQueue();
    if (logQueue.length === 0) return;
    const batch = logQueue.splice(0, BATCH_SIZE);
    SystemLog.insertMany(batch, { ordered: false }).catch(() => {});
}

function startFlushTimer() {
    if (flushTimer) return;
    flushTimer = setInterval(flushLogs, FLUSH_INTERVAL_MS);
}

function shouldPersistToDB(entry) {
    if (entry.level === "error") return true;
    if (entry.category === "auth" || entry.category === "moderation" || entry.category === "system") return true;
    if (entry.action === "http_request") return false;
    return entry.level === "warn";
}

function log(entry) {
    if (!entry || !entry.category || !entry.action) return;
    if (!LOG_CATEGORIES.includes(entry.category)) return;
    if (!LOG_LEVELS.includes(entry.level)) entry.level = "info";

    const doc = {
        category: entry.category,
        level: entry.level,
        action: entry.action,
        message: entry.message || "",
        username: entry.username || null,
        ip: entry.ip || null,
        userAgent: entry.userAgent || null,
        method: entry.method || null,
        path: entry.path || null,
        statusCode: entry.statusCode || null,
        duration: entry.duration || null,
        meta: entry.meta || {},
        gameId: entry.gameId || null,
        gameType: entry.gameType || null,
        targetUser: entry.targetUser || null,
        room: entry.room || null,
    };

    fileQueue.push(JSON.stringify({ ...doc, createdAt: new Date().toISOString() }));
    if (shouldPersistToDB(doc)) {
        logQueue.push(doc);
        if (logQueue.length >= BATCH_SIZE) flushLogs();
    }
    startFlushTimer();
}

function logAuth(action, username, extra = {}) {
    log({ category: "auth", action, username, level: extra.level || "info", message: extra.message || "", ip: extra.ip, meta: extra.meta });
}

function logUser(action, username, extra = {}) {
    log({ category: "users", action, username, level: extra.level || "info", message: extra.message || "", targetUser: extra.targetUser, ip: extra.ip, meta: extra.meta });
}

function logServer(action, extra = {}) {
    log({ category: "server", action, level: extra.level || "info", message: extra.message || "", method: extra.method, path: extra.path, statusCode: extra.statusCode, duration: extra.duration, meta: extra.meta, username: extra.username, ip: extra.ip });
}

function logDatabase(action, extra = {}) {
    log({ category: "database", action, level: extra.level || "info", message: extra.message || "", duration: extra.duration, meta: extra.meta, username: extra.username });
}

function logGame(action, extra = {}) {
    log({ category: "games", action, level: extra.level || "info", message: extra.message || "", gameId: extra.gameId, gameType: extra.gameType, username: extra.username, meta: extra.meta, room: extra.room });
}

function logChat(action, extra = {}) {
    log({ category: "chats", action, level: extra.level || "info", message: extra.message || "", username: extra.username, targetUser: extra.targetUser, room: extra.room, meta: extra.meta });
}

function logFrontend(action, extra = {}) {
    log({ category: "frontend", action, level: extra.level || "info", message: extra.message || "", username: extra.username, ip: extra.ip, userAgent: extra.userAgent, path: extra.path, meta: extra.meta });
}

function logModeration(action, extra = {}) {
    log({ category: "moderation", action, level: extra.level || "info", message: extra.message || "", username: extra.username, targetUser: extra.targetUser, meta: extra.meta });
}

function logSystem(action, extra = {}) {
    log({ category: "system", action, level: extra.level || "info", message: extra.message || "", meta: extra.meta });
}

function flushNow() {
    return new Promise((resolve) => {
        writeFileQueue();
        if (logQueue.length === 0) return resolve();
        const batch = logQueue.splice(0);
        SystemLog.insertMany(batch, { ordered: false }).then(() => resolve()).catch(() => resolve());
    });
}

module.exports = {
    log,
    logAuth,
    logUser,
    logServer,
    logDatabase,
    logGame,
    logChat,
    logFrontend,
    logModeration,
    logSystem,
    flushNow,
    LOG_CATEGORIES,
    LOG_LEVELS,
};