import { SignJWT, jwtVerify } from "jose";
import { cookies, headers } from "next/headers";
import { getJwtSecret } from "@/utils/jwt";

const SECRET = getJwtSecret();

const COOKIE = "af_session";
const MAX_AGE = 60 * 60 * 24 * 365; // 1 year

// True when the current request reached us over HTTPS, honouring the
// X-Forwarded-Proto set by Caddy/nginx/Vercel in front of the app. When no
// proxy header is present we can only guess, so fall back to NODE_ENV — but
// never infer HTTPS from a non-localhost Host, because a phone on
// http://192.168.x.x:3000 would then be marked Secure and lose its session.
async function isSecureRequest() {
    try {
        const h = await headers();
        const proto = h.get("x-forwarded-proto");
        if (proto) return proto.split(",")[0].trim().toLowerCase() === "https";
        if (h.get("x-forwarded-ssl") === "on") return true;
        const host = (h.get("host") || "").split(":")[0].toLowerCase();
        if (host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1") return false;
        return process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
    } catch {
        return process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
    }
}

export async function signToken(payload) {
    return new SignJWT(payload)
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime(`${MAX_AGE}s`)
        .sign(SECRET);
}

export async function verifyToken(token) {
    try {
        const { payload } = await jwtVerify(token, SECRET);
        return payload;
    } catch (err) {
        // Don't throw on expired tokens - return null for graceful handling
        console.error("verifyToken failed:", err?.message ?? err);
        return null;
    }
}

export async function setSessionCookie(userId) {
    const token = await signToken({ userId });
    const cookieStore = await cookies();
    // Follow the scheme the browser actually used, not NODE_ENV. Marking the
    // cookie `Secure` while the app is served over plain HTTP (the Tauri shell
    // against http://localhost:3000, or a phone on a LAN IP) makes the browser
    // silently drop it, so the session never sticks.
    const secure = isSecureRequest();
    cookieStore.set(COOKIE, token, {
        httpOnly: true,
        secure,
        sameSite: secure ? "none" : "lax",
        maxAge:   MAX_AGE,
        path:     "/",
    });
}

export async function getSession() {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE)?.value;
    if (!token) return null;
    try {
        const payload = await verifyToken(token);
        // verifyToken now returns null on error instead of throwing
        return payload;
    } catch (err) {
        console.error("getSession: token verification error:", err?.message ?? err);
        return null;
    }
}

export async function clearSession() {
    const cookieStore = await cookies();
    cookieStore.delete(COOKIE);
}
