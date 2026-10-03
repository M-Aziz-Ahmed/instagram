// Proves the scheduler lock: with several live-server processes, exactly one may run
// publishScheduledPosts()/runBotPosts() per tick, or every scheduled post would be
// published once per instance.
//
// Run: node live-server/lib/singleton.test.js
const assert = require("node:assert/strict");
const { initRedis, isRedisReady, closeRedis } = require("./redis");
const { acquireTick } = require("./singleton");

const w = (m) => process.stderr.write(`[lock] ${m}\n`);

(async () => {
    await initRedis();

    if (!isRedisReady()) {
        w("SKIP: no Redis. With one process there is nothing to arbitrate.");
        await closeRedis();
        process.exit(0);
    }

    const KEY = "anontweet:leader:test-job";
    const redis = (() => {
        // Reuse the module's client rather than opening another connection.
        const { getRedis } = require("./redis");
        return getRedis();
    })();
    await redis.del(KEY);

    // Two instances racing for the same tick.
    const [first, second] = await Promise.all([
        acquireTick("test-job", 30000),
        acquireTick("test-job", 30000),
    ]);
    w(`instance A won: ${first}`);
    w(`instance B won: ${second}`);
    assert.equal(first, true, "the first instance must win the tick");
    assert.equal(second, false, "the second instance must stand down for this tick");

    // A later tick after the lock expires lets the other instance take over, which is
    // what makes this survive the holder dying rather than stalling the schedule.
    await redis.del(KEY);
    const afterExpiry = await acquireTick("test-job", 30000);
    w(`after release, next instance won: ${afterExpiry}`);
    assert.equal(afterExpiry, true);

    // With Redis absent the job must still run (single process).
    await closeRedis();
    const noRedis = await acquireTick("test-job", 30000);
    w(`with Redis down, job still runs locally: ${noRedis}`);
    assert.equal(noRedis, true, "a single instance must never stall its own scheduler");

    process.exit(0);
})().catch((err) => {
    w("FAIL: " + err.message);
    process.exit(1);
});
