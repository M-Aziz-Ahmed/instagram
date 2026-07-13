import { NextResponse } from "next/server";
import { jwtVerify } from "jose";

const SECRET = new TextEncoder().encode(
    process.env.JWT_SECRET || "anonfeed_jwt_secret_change_in_production_32chars"
);

const PUBLIC_PATHS = ["/login", "/api/auth/send-otp", "/api/auth/verify-otp"];

export async function middleware(request) {
    const { pathname } = request.nextUrl;

    if (
        PUBLIC_PATHS.some((p) => pathname.startsWith(p)) ||
        pathname.startsWith("/_next") ||
        pathname.startsWith("/favicon")
    ) {
        return NextResponse.next();
    }

    const token = request.cookies.get("af_session")?.value;
    if (!token) {
        const loginUrl = new URL("/login", request.url);
        return NextResponse.redirect(loginUrl);
    }

    try {
        await jwtVerify(token, SECRET);
        return NextResponse.next();
    } catch {
        const loginUrl = new URL("/login", request.url);
        return NextResponse.redirect(loginUrl);
    }
}

export const config = {
    matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
