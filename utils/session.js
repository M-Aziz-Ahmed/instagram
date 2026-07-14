import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { getJwtSecret } from "@/utils/jwt";

const SECRET = getJwtSecret();

const COOKIE = "af_session";
const MAX_AGE = 60 * 60 * 24 * 365; // 1 year

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
    const isProd = process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
    const secure = isProd;
    const sameSite = secure ? "none" : "lax";
    cookieStore.set(COOKIE, token, {
        httpOnly: true,
        secure,
        sameSite,
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
