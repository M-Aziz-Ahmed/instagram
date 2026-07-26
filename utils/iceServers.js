// Shared TURN/STUN configuration for WebRTC (voice + live streaming).
//
// We use OUR OWN TURN server (coturn) running on the live-server machine,
// exposed as TURN-over-TLS on port 8443 (turns:) so it is reachable even from
// networks that block non-standard ports or restrict UDP (e.g. China).
//
// TURN is listed FIRST so it is preferred — this ensures connections from
// restrictive networks (China, corporate firewalls, VPNs) go through the relay
// instead of trying direct UDP which will fail.
//
// Google STUN servers are blocked in China, so we also include free public
// STUN servers from Open Relay and Twilio that are less likely to be blocked.

const TURN_URL = process.env.NEXT_PUBLIC_TURN_URL || "turns:anontweet.duckdns.org:8443";
const TURN_USER = process.env.NEXT_PUBLIC_TURN_USER || "anonturn";
const TURN_CRED = process.env.NEXT_PUBLIC_TURN_CRED || "change-me-in-env";

const TURN_SERVER = {
    urls: TURN_URL,
    username: TURN_USER,
    credential: TURN_CRED,
};

const STUN_SERVERS = [
    { urls: "stun:openrelay.metered.ca:80" },
    { urls: "stun:openrelay.metered.ca:443" },
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
];

// Default: TURN first, then STUN for server-reflexive candidates.
export const ICE_SERVERS = {
    iceServers: [TURN_SERVER, ...STUN_SERVERS],
};

// Relay-only: forces all traffic through the TURN server.
// Used as a fallback when direct/STUN connectivity fails (e.g. behind
// restrictive firewalls, VPNs that block UDP, or in China).
export const RELAY_ONLY_ICE_SERVERS = {
    iceTransportPolicy: "relay",
    iceServers: [TURN_SERVER],
};

export default ICE_SERVERS;
