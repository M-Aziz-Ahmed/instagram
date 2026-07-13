import { NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { getJwtSecret } from "@/utils/jwt";

const SECRET = getJwtSecret();

const PUBLIC_PATHS = ["/login", "/api/auth/send-otp", "/api/auth/verify-otp"];

function isApiPath(pathname) {
    return pathname.startsWith("/api/");
}

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
        if (isApiPath(pathname)) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        return NextResponse.redirect(new URL("/login", request.url));
    }

    try {
        await jwtVerify(token, SECRET);
        return NextResponse.next();
    } catch {
        if (isApiPath(pathname)) {
            return NextResponse.json({ error: "Invalid session" }, { status: 401 });
        }
        return NextResponse.redirect(new URL("/login", request.url));
    }
}

export const config = {
    matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
