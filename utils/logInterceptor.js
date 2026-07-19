"use client";

const FLUSH_INTERVAL = 5000;
const MAX_QUEUE = 100;

let queue = [];
let installed = false;
let timer = null;

function serialize(val) {
    if (val === undefined) return "undefined";
    if (val === null) return "null";
    if (typeof val === "string") return val;
    if (val instanceof Error) return val.stack || val.message;
    try {
        return JSON.stringify(val, null, 2);
    } catch {
        return String(val);
    }
}

async function flush() {
    if (queue.length === 0) return;
    const batch = queue.splice(0, MAX_QUEUE);
    try {
        await fetch("/api/admin/logs/client", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(batch),
            keepalive: true,
        });
    } catch {
        // don't re-queue — logs are best-effort
    }
}

function capture(level, original, args) {
    original.apply(console, args);
    const msg = args.map(serialize).join(" ");
    queue.push({ level, msg });
    if (queue.length >= MAX_QUEUE) flush();
}

export function installLogInterceptor() {
    if (installed || typeof window === "undefined") return;
    installed = true;

    const origLog = console.log.bind(console);
    const origWarn = console.warn.bind(console);
    const origError = console.error.bind(console);

    console.log = (...args) => capture("info", origLog, args);
    console.warn = (...args) => capture("warn", origWarn, args);
    console.error = (...args) => capture("error", origError, args);

    window.addEventListener("error", (e) => {
        queue.push({
            level: "error",
            msg: `Uncaught: ${e.message}\n  at ${e.filename}:${e.lineno}:${e.colno}`,
        });
    });

    window.addEventListener("unhandledrejection", (e) => {
        const reason = e.reason instanceof Error ? (e.reason.stack || e.reason.message) : String(e.reason);
        queue.push({ level: "error", msg: `Unhandled promise rejection: ${reason}` });
    });

    timer = setInterval(flush, FLUSH_INTERVAL);
    window.addEventListener("beforeunload", flush);
}
