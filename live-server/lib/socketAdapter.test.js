// Proves the thing the whole redesign rests on: with the Redis adapter attached,
// a broadcast emitted on one live-server instance reaches a client connected to a
// *different* instance. Without the adapter that delivery is impossible, because
// Socket.IO rooms only exist in the emitting process's memory.
//
// Run: node live-server/lib/socketAdapter.test.js
const assert = require("node:assert/strict");
const { Server } = require("socket.io");
const { initRedis, isRedisReady, closeRedis, createDedicatedClient } = require("./redis");
const { attachSocketAdapter } = require("./socketAdapter");

// Never let a stuck socket or redis handle hang a test run.
const watchdog = setTimeout(() => {
    process.stderr.write("\nWATCHDOG: test exceeded its budget\n");
    process.exit(2);
}, 60000);
watchdog.unref?.();

const log = (...a) => {
    process.stderr.write(a.join(" ") + "\n");
};

async function makeInstance(port, useAdapter) {
    const http = require("node:http");
    const server = http.createServer();
    const io = new Server(server, { path: "/sio", transports: ["websocket"] });
    if (useAdapter) await attachSocketAdapter(io);
    await new Promise((r) => server.listen(port, r));
    return { server, io };
}

function connectClient(url) {
    const { io: clientIo } = require("socket.io-client");
    return new Promise((resolve, reject) => {
        const c = clientIo(url, { path: "/sio", transports: ["websocket"], forceNew: true });
        c.on("connect", () => resolve(c));
        c.on("connect_error", reject);
        setTimeout(() => reject(new Error("client connect timeout")), 8000);
    });
}

(async () => {
    const connected = await initRedis();
    log(`redis reachable: ${connected} (ready=${isRedisReady()})`);
    if (!connected) {
        log("SKIP: no Redis available; cannot verify the adapter.");
        await closeRedis();
        process.exit(0);
    }

    const dedicated = await createDedicatedClient("test");
    assert.ok(dedicated, "dedicated pub/sub client should be creatable");
    log("dedicated pub/sub client: OK");
    await dedicated.quit();

    // ── Without the adapter: prove the delivery gap is real ────────────────────
    const a = await makeInstance(45001, false);
    const b = await makeInstance(45002, false);
    const clientB = await connectClient("http://127.0.0.1:45002");
    // Put the client's socket into the room server-side. Emitting a "join" event
    // would need a handler on the test server, and nothing would ever ack it.
    b.io.sockets.sockets.get(clientB.id)?.join("r1");
    await new Promise((r) => setTimeout(r, 400));

    let sawWithout = false;
    clientB.on("ping-user", () => { sawWithout = true; });
    await new Promise((r) => setTimeout(r, 300));
    a.io.to("r1").emit("ping-user", { from: "instance-a" });
    await new Promise((r) => setTimeout(r, 1200));
    log(`process-local only -> client on instance B received: ${sawWithout}`);
    assert.equal(sawWithout, false, "without the adapter a broadcast must NOT cross instances");
    clientB.close();
    a.server.close(); a.io.close();
    b.server.close(); b.io.close();

    // ── With the adapter: the delivery must now work ──────────────────────────
    const a2 = await makeInstance(45003, true);
    const b2 = await makeInstance(45004, true);
    const clientB2 = await connectClient("http://127.0.0.1:45004");
    b2.io.sockets.sockets.get(clientB2.id)?.join("r1");
    await new Promise((r) => setTimeout(r, 500));

    let sawWith = false;
    clientB2.on("ping-user", (p) => { if (p?.from === "instance-a2") sawWith = true; });
    await new Promise((r) => setTimeout(r, 300));
    a2.io.to("r1").emit("ping-user", { from: "instance-a2" });
    await new Promise((r) => setTimeout(r, 1500));

    log(`with redis adapter  -> client on instance B received: ${sawWith}`);
    clientB2.close();
    a2.server.close(); a2.io.close();
    b2.server.close(); b2.io.close();

    await closeRedis();

    if (!sawWith) {
        process.stderr.write("\nFAIL: the adapter is attached but the broadcast did not cross instances.");
        process.exit(1);
    }
    log("\nPASS: without the adapter delivery fails, with it delivery succeeds.");
    process.exit(0);
})().catch((err) => {
    process.stderr.write("test error:", err.message);
    process.exit(1);
});
