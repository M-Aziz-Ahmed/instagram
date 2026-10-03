// Attach the Socket.IO Redis adapter.
//
// Without this, Socket.IO rooms live in the memory of whichever process emitted the
// event. With one live-server that is correct and cheap. With several - the desktop
// app runs its own instance - Alice's call offer is emitted into instance A's memory
// while Bob's socket hangs off instance B, so he never receives it. Mongo would still
// store the conversation; the delivery is what breaks.
//
// The adapter makes every instance one logical cluster. It is strictly additive: with
// Redis absent this returns false and Socket.IO keeps its in-memory behaviour, which
// is correct for a single process.

const { isRedisReady, createDedicatedClient } = require("./redis");

/**
 * @param {import("socket.io").Server} io
 * @returns {Promise<boolean>} true when the cluster-wide adapter is active
 */
async function attachSocketAdapter(io) {
    if (!isRedisReady()) {
        console.log("[Socket] Redis not available - rooms are process-local (fine for a single instance)");
        return false;
    }

    let pub = null;
    let sub = null;
    try {
        // Pub/sub needs its own connections: a subscribed client cannot issue commands.
        pub = await createDedicatedClient("adapter-pub");
        sub = await createDedicatedClient("adapter-sub");
        if (!pub || !sub) return false;

        const { createAdapter } = require("@socket.io/redis-adapter");
        io.adapter(createAdapter(pub, sub));
        console.log("[Socket] Redis adapter attached - rooms and broadcasts span all instances");
        return true;
    } catch (err) {
        console.warn("[Socket] Redis adapter unavailable, staying process-local:", err.message);
        try {
            await pub?.quit();
        } catch {}
        try {
            await sub?.quit();
        } catch {}
        return false;
    }
}

module.exports = { attachSocketAdapter };
