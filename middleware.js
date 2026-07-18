import { NextResponse } from "next/server";
import { jwtVerify } from "jose";

const SECRET = new TextEncoder().encode(
    process.env.JWT_SECRET || "anonfeed_jwt_secret_change_in_production_32chars"
);

const PUBLIC_PATHS = [
    "/",
    "/login",
    "/search",
    "/tag",
    "/api/auth",
    "/api/posts",
    "/api/feed",
    "/api/search",
    "/api/ads",
    "/api/trending",
];

function isPublicPath(pathname) {
    return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

function isStaticPath(pathname) {
    return (
        pathname.startsWith("/_next") ||
        pathname.startsWith("/favicon") ||
        pathname.startsWith("/stockfish") ||
        pathname.endsWith(".ico") ||
        pathname.endsWith(".js") ||
        pathname.endsWith(".css") ||
        pathname.endsWith(".png") ||
        pathname.endsWith(".jpg") ||
        pathname.endsWith(".svg") ||
        pathname.endsWith(".woff2")
    );
}

function isApiPath(pathname) {
    return pathname.startsWith("/api/");
}

export async function middleware(request) {
    const { pathname } = request.nextUrl;

    if (isStaticPath(pathname) || isPublicPath(pathname)) {
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
