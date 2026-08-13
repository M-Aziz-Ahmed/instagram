const LIVE_SERVER = process.env.NEXT_PUBLIC_LIVE_SERVER_URL;

export function getSocketConfig(opts = {}) {
    const base = {
        query: opts.username ? { username: opts.username } : undefined,
        withCredentials: true,
        reconnectionAttempts: opts.reconnectionAttempts ?? 30,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: opts.timeout ?? 30000,
        ...opts.extra,
    };

    if (typeof window === "undefined") {
        return { url: LIVE_SERVER || "http://localhost:3001", config: base };
    }

    const sameOrigin = window.location.origin === new URL(LIVE_SERVER || "http://localhost:3001").origin;

    if (sameOrigin) {
        return {
            url: LIVE_SERVER,
            config: { ...base, path: "/sio", transports: ["polling", "websocket"], upgrade: true, rememberUpgrade: false },
        };
    }

    return {
        url: window.location.origin,
        config: {
            ...base,
            path: "/sio",
            transports: ["polling"],
        },
    };
}
