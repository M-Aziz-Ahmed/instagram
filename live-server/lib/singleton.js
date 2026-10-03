// Run a periodic job on exactly one live-server process.
//
// Two of the timers in server.js have side effects that are not idempotent per
// instance: publishScheduledPosts() flips scheduled posts to published, and
// runBotPosts() creates bot content. With N live-server processes - which is what
// happens once the desktop app ships its own - every instance would run them and each
// post would be published N times.
//
// Redis SET NX gives a lock that is automatically released if the holder dies, so a
// central instance that crashes hands the job to another within one interval instead
// of stalling the schedule. Without Redis there is a single process anyway, so the
// job simply runs locally.

const LOCK_TTL_MS = 30000;

let warned = false;

/**
 * @param {string} name    lock name, unique per job
 * @param {number} ttlMs   how long the lock is held before the holder must renew
 * @returns {Promise<boolean>} true when this process holds the lock for this tick
 */
async function acquireTick(name, ttlMs = LOCK_TTL_MS) {
    const { getRedis, isRedisReady } = require("./redis");

    if (!isRedisReady()) {
        // Single process: nothing to arbitrate.
        return true;
    }

    const redis = getRedis();
    if (!redis) return true;

    const key = `anontweet:leader:${name}`;
    try {
        // NX means "only if absent"; the TTL means we never hold it forever.
        const won = await redis.set(key, String(process.pid), { NX: true, PX: ttlMs });
        if (won) return true;
        return false;
    } catch (err) {
        if (!warned) {
            console.warn(`[Leader] lock for ${name} failed, running locally:`, err.message);
            warned = true;
        }
        return true;
    }
}

/**
 * Start an interval that only runs `fn` on the lock holder.
 * @returns {NodeJS.Timeout|null} the timer, or null when disabled
 */
function startSingletonInterval(name, intervalMs, fn, { enabled = true } = {}) {
    if (!enabled) {
        console.log(`[Leader] ${name} disabled on this instance`);
        return null;
    }
    const timer = setInterval(async () => {
        const mine = await acquireTick(name, intervalMs * 2);
        if (!mine) return;
        try {
            await fn();
        } catch (err) {
            console.error(`[Leader] ${name} tick failed:`, err.message);
        }
    }, intervalMs);
    timer.unref?.();
    return timer;
}

module.exports = { acquireTick, startSingletonInterval };
