// Shared TURN/STUN configuration for WebRTC (calls, voice chat, live streaming).
//
// WHY THIS FILE IS NOT A SINGLE HARD-CODED RELAY
//
// A call only works for everyone if some machine relays it. On a permissive
// network two browsers find each other directly via STUN and never touch TURN;
// on a symmetric NAT, a corporate firewall, a mobile carrier, or a network that
// blocks UDP, direct connectivity fails and the relay is the ONLY path. That is
// why "calls work for me but not for some users" is almost always "the relay is
// down", not "the signalling is broken".
//
// So the relay list is configurable and the absence of a relay is a first-class,
// visible state rather than a silently broken object:
//   - NEXT_PUBLIC_TURN_URL       one relay URL (kept for backwards compatibility)
//   - NEXT_PUBLIC_TURN_URLS      comma-separated relay URLs (preferred; several
//                                relays = several independent failure domains)
//   - NEXT_PUBLIC_TURN_USER / _CRED        credentials for the single-relay form
//   - NEXT_PUBLIC_TURN_SERVERS   JSON, when relays need DIFFERENT credentials:
//     [{"urls":"turns:a.example:443","username":"u","credential":"c"}, ...]
//
// A relay whose URL or credential is still the placeholder is dropped rather
// than shipped. Handing the browser a TURN entry it cannot authenticate to is
// worse than handing it none: it spends its gathering budget on a dead relay on
// every single connection before falling back to STUN, which delays call setup
// for EVERY user in order to help nobody.

const PLACEHOLDER_CRED = "change-me-in-env";

// Turning this on logs the resolved relay list and, on a failed connection, the
// candidate pairs that were actually tried. It is the difference between "calls
// are broken" and a diagnosis.
const DEBUG = process.env.NEXT_PUBLIC_TURN_DEBUG === "1";

/** Split a comma/whitespace separated env list into trimmed, non-empty entries. */
function splitList(value) {
    return String(value || "")
        .split(/[,\s]+/)
        .map((s) => s.trim())
        .filter(Boolean);
}

function isPlaceholder(value) {
    return !value || value === PLACEHOLDER_CRED;
}

/**
 * Build the relay list from the environment. Returns an array of
 * RTCIceServer-shaped objects; may be empty, which is a valid configuration.
 */
function buildTurnServers() {
    // The JSON form wins: it is the only one that can express more than one
    // distinct credential pair.
    if (process.env.NEXT_PUBLIC_TURN_SERVERS) {
        try {
            const parsed = JSON.parse(process.env.NEXT_PUBLIC_TURN_SERVERS);
            if (Array.isArray(parsed)) {
                return parsed
                    .filter((s) => s && typeof s.urls === "string" && s.urls.trim())
                    .map((s) => ({
                        urls: s.urls.trim(),
                        // A relay without credentials is still valid (some public
                        // relays are open), so only drop a *placeholder* credential.
                        ...(isPlaceholder(s.username) && isPlaceholder(s.credential)
                            ? {}
                            : { username: s.username, credential: s.credential }),
                    }));
            }
        } catch {
            if (DEBUG) console.warn("[ice] NEXT_PUBLIC_TURN_SERVERS is not valid JSON; ignoring it.");
        }
    }

    const urls = [
        ...splitList(process.env.NEXT_PUBLIC_TURN_URLS),
        ...splitList(process.env.NEXT_PUBLIC_TURN_URL),
    ].filter((u) => !isPlaceholder(u));

    // No usable URL, or the credential was never set: no relay. Fall through to
    // STUN rather than shipping an entry that cannot authenticate.
    if (urls.length === 0) return [];
    const user = process.env.NEXT_PUBLIC_TURN_USER;
    const cred = process.env.NEXT_PUBLIC_TURN_CRED;
    if (isPlaceholder(user) || isPlaceholder(cred)) {
        if (DEBUG) console.warn("[ice] TURN URL is set but TURN_USER/TURN_CRED are not; relays dropped.");
        return [];
    }

    return urls.map((url) => ({ urls: url, username: user, credential: cred }));
}

const TURN_SERVERS = buildTurnServers();

// Google STUN is blocked on some networks, so openrelay entries lead. These
// answer STUN only — they cannot relay media.
const STUN_SERVERS = [
    { urls: "stun:openrelay.metered.ca:80" },
    { urls: "stun:openrelay.metered.ca:443" },
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
];

// Relays first so a restrictive network prefers the path that works there,
// then STUN for the server-reflexive candidates the common case relies on.
export const ICE_SERVERS = {
    iceServers: [...TURN_SERVERS, ...STUN_SERVERS],
};

/**
 * Relay-only, for the recovery attempt after a connection has already failed.
 *
 * This previously hardcoded the same single relay the first attempt used, so
 * when the relay was the thing that was down the fallback was guaranteed to
 * fail too — and failed *faster*, because forbidding direct candidates removes
 * the STUN path that would otherwise have saved the call. It now uses the full
 * configured relay list, and when there are no relays configured it degrades to
 * the ordinary config instead of advertising `relay` with nothing to relay to.
 */
export const RELAY_ONLY_ICE_SERVERS = TURN_SERVERS.length > 0
    ? { iceTransportPolicy: "relay", iceServers: TURN_SERVERS }
    : { iceServers: [...TURN_SERVERS, ...STUN_SERVERS] };

/**
 * True when no relay is configured. Callers use this to tell the user the real
 * reason their call failed instead of leaving them on "Connecting…" forever.
 */
export function turnRelayMissing() {
    return TURN_SERVERS.length === 0;
}

/** The configured relays, for diagnostics and the admin/health surface. */
export function turnRelaySummary() {
    return {
        count: TURN_SERVERS.length,
        urls: TURN_SERVERS.map((s) => s.urls),
        relayOnlyUsable: TURN_SERVERS.length > 0,
    };
}

/**
 * Dump the ICE candidates a connection actually gathered, including whether
 * any of them were relayed. "connected but silent" and "never connected" have
 * completely different fixes, and `connectionState` alone cannot tell them
 * apart. Cheap, and only ever runs when ICE has genuinely failed.
 */
export function logIceFailure(label, pc, err) {
    if (!DEBUG) return;
    try {
        const stats = pc?.getStats?.();
        const pairs = [];
        stats?.forEach?.((r) => {
            if (r.type === "candidate-pair" && (r.nominated || r.state === "succeeded")) {
                pairs.push({ local: r.localCandidateId, remote: r.remoteCandidateId, state: r.state });
            }
            if (r.type === "local-candidate") {
                pairs.push({ candidate: `${r.candidateType}/${r.protocol}:${r.address}:${r.port}`, relay: r.relayProtocol || null });
            }
        });
        console.warn(
            `[ice] ${label} failed:`, err?.message || err,
            "| relay configured:", TURN_SERVERS.length, TURN_SERVERS.map((s) => s.urls),
            "| candidates:", pairs,
        );
    } catch {
        console.warn(`[ice] ${label} failed:`, err?.message || err);
    }
}

export default ICE_SERVERS;
