// Shared TURN/STUN configuration for WebRTC (voice + live streaming).
//
// We use OUR OWN TURN server (coturn) running on the live-server machine,
// exposed as TURN-over-TLS on port 443 (turns:) so it is reachable even from
// networks that block non-standard ports or restrict UDP (e.g. China).
//
// Credentials are read from env so they are not hardcoded/shared publicly.
// Generate a credential with:  turnadmin -k -u <user> -p <password> -r <realm>
// or simply use a long random static password below.

const TURN_URL = process.env.NEXT_PUBLIC_TURN_URL || "turns:anontweet.duckdns.org:8443";
const TURN_USER = process.env.NEXT_PUBLIC_TURN_USER || "anonturn";
const TURN_CRED = process.env.NEXT_PUBLIC_TURN_CRED || "change-me-in-env";

const STUN_SERVERS = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
];

export const ICE_SERVERS = {
    iceServers: [
        ...STUN_SERVERS,
        {
            urls: TURN_URL,
            username: TURN_USER,
            credential: TURN_CRED,
        },
    ],
};

export default ICE_SERVERS;
