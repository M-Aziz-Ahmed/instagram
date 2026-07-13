import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const SECRET = new TextEncoder().encode(
    process.env.JWT_SECRET || "anonfeed_fallback_secret_32chars!!"
);

const COOKIE = "af_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export async function signToken(payload) {
    return new SignJWT(payload)
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime(`${MAX_AGE}s`)
        .sign(SECRET);
}

export async function verifyToken(token) {
    const { payload } = await jwtVerify(token, SECRET);
    return payload;
}

export async function setSessionCookie(userId) {
    const token = await signToken({ userId });
    const cookieStore = await cookies();
    cookieStore.set(COOKIE, token, {
        httpOnly: true,
        secure:   false,
        sameSite: "lax",
        maxAge:   MAX_AGE,
        path:     "/",
    });
}

export async function getSession() {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE)?.value;
    if (!token) return null;
    try {
        return await verifyToken(token);
    } catch {
        return null;
    }
}

export async function clearSession() {
    const cookieStore = await cookies();
    cookieStore.delete(COOKIE);
}
