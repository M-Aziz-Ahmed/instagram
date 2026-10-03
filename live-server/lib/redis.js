// Shared Redis connection.
//
// Redis is optional. With a single live-server process everything works in-memory,
// so this module never throws and never blocks boot for long - it reports "not
// available" and callers fall back to their local implementation.
//
// With more than one live-server process (the desktop app runs its own), Redis
// becomes load-bearing in two places:
//   - the Socket.IO adapter, so calls, voice, games and live streams are delivered
//     across processes instead of dying in the memory of whichever one emitted them
//   - rate-limit counters, which are otherwise per-process and multiply the
//     configured limits by the number of instances
//
// Pub/sub needs dedicated connections: a subscribed client cannot issue normal
// commands, so the adapter gets its own pair via createDedicatedClient().

const { createClient } = require("redis");

const CONNECT_TIMEOUT_MS = 3000;

// Give up instead of retrying forever. Without a bounded strategy node-redis retries
// silently and connect() never settles, which would hang the whole server at boot -
// unacceptable in a desktop app where Redis is optional.
const INITIAL_RETRY_DELAY_MS = 200;
const MAX_RETRY_DELAY_MS = 5000;
const INITIAL_CONNECT_ATTEMPTS = 3;

// node-redis negotiates RESP3 by sending HELLO on connect, which Redis older than
// 6.0 rejects with "ERR unknown command 'HELLO'" - and then it retries forever.
// RESP2 is supported by every Redis release and is all a pub/sub bus and a set of
// counters need, so default to it. Set REDIS_RESP=3 to opt into RESP3 on a modern
// server.
const RESP = process.env.REDIS_RESP === "3" ? 3 : 2;

let client = null;
let ready = false;
let initPromise = null;

function buildClient(label) {
    const url = process.env.REDIS_URL || "redis://localhost:6379";
    const c = createClient({
        url,
        RESP,
        socket: {
            connectTimeout: CONNECT_TIMEOUT_MS,
            reconnectStrategy: (retries) => {
                if (retries >= INITIAL_CONNECT_ATTEMPTS) {
                    return new Error(`redis (${label}) unreachable after ${retries} attempts`);
                }
                return Math.min(retries * INITIAL_RETRY_DELAY_MS, MAX_RETRY_DELAY_MS);
            },
        },
    });
    // Without a listener node-redis throws on connection errors and takes the
    // process down. Losing Redis degrades us to single-instance behaviour, which is
    // strictly better than crashing.
    c.on("error", (err) => {
        if (ready) console.warn(`[Redis] ${label} connection lost:`, err.message);
        ready = false;
    });
    c.on("ready", () => {
        ready = true;
        console.log(`[Redis] ${label} connected (RESP${RESP})`);
    });
    return c;
}

async function initRedis() {
    if (initPromise) return initPromise;
    initPromise = (async () => {
        try {
            client = buildClient("main");
            await client.connect();
            ready = true;
            return true;
        } catch (err) {
            // Almost always one of: nothing listening, wrong password, or a server
            // too old for the negotiated protocol. None of them should stop boot.
            console.warn(
                `[Redis] unavailable, continuing without it (${err.message}). ` +
                `Running single-instance: socket rooms and rate limits stay process-local.`
            );
            ready = false;
            client = null;
            return false;
        }
    })();
    return initPromise;
}

function isRedisReady() {
    return Boolean(ready && client);
}

function getRedis() {
    return isRedisReady() ? client : null;
}

// A separate connection for pub/sub, or null when Redis is not available.
async function createDedicatedClient(label) {
    if (!isRedisReady()) return null;
    try {
        const c = buildClient(label);
        await c.connect();
        return c;
    } catch (err) {
        console.warn(`[Redis] dedicated client ${label} failed:`, err.message);
        return null;
    }
}

async function closeRedis() {
    if (!client) return;
    try {
        await client.quit();
    } catch {
        /* already gone */
    }
    client = null;
    ready = false;
    initPromise = null;
}

module.exports = {
    initRedis,
    isRedisReady,
    getRedis,
    createDedicatedClient,
    closeRedis,
};
