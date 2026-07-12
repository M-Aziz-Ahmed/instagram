import { NextResponse } from "next/server";
import { jwtVerify } from "jose";

const SECRET = new TextEncoder().encode(
    process.env.JWT_SECRET || "anonfeed_fallback_secret_32chars!!"
);

const PUBLIC_PATHS = ["/login", "/api/auth/send-otp", "/api/auth/verify-otp"];

export async function proxy(request) {
    const { pathname } = request.nextUrl;

    // Let public paths and static assets through
    if (
        PUBLIC_PATHS.some((p) => pathname.startsWith(p)) ||
        pathname.startsWith("/_next") ||
        pathname.startsWith("/favicon")
    ) {
        return NextResponse.next();
    }

    // Check session cookie
    const token = request.cookies.get("af_session")?.value;
    if (!token) {
        const loginUrl = new URL("/login", request.url);
        return NextResponse.redirect(loginUrl);
    }

    try {
        await jwtVerify(token, SECRET);
        return NextResponse.next();
    } catch {
        // Invalid or expired token — clear it and redirect
        const loginUrl = new URL("/login", request.url);
        const res = NextResponse.redirect(loginUrl);
        res.cookies.delete("af_session");
        return res;
    }
}

export const config = {
    matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
