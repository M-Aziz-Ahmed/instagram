import { NextResponse } from "next/server";
import { jwtVerify } from "jose";

const SECRET = new TextEncoder().encode(
    process.env.JWT_SECRET || "anonfeed_jwt_secret_change_in_production_32chars"
);

const PUBLIC_PATHS = ["/login", "/api/auth/send-otp", "/api/auth/verify-otp"];

function isApiPath(pathname) {
    return pathname.startsWith("/api/");
}

export async function proxy(request) {
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
