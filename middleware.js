import { NextResponse } from "next/server";
import { jwtVerify } from "jose";

const SECRET = new TextEncoder().encode(
    process.env.JWT_SECRET || "anonfeed_jwt_secret_change_in_production_32chars"
);

const PUBLIC_PATHS = [
    "/",
    "/login",
    "/social",
    "/browser",
    "/entertainment",
    "/me",
    "/search",
    "/tag",
    "/anime",
    "/manga",
    "/movies",
    "/kdramas",
    "/seasons",
    "/cdramas",
    "/cartoons",
    "/library",
    "/api/auth",
    "/api/posts",
    "/api/feed",
    "/api/search",
    "/api/ads",
    "/api/trending",
    "/api/hashtags",
    "/api/anime-proxy",
    "/api/browser",
];

function isPublicPath(pathname) {
    return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

function isStaticPath(pathname) {
    return (
        pathname.startsWith("/_next") ||
        pathname.startsWith("/favicon") ||
        pathname.startsWith("/stockfish") ||
        pathname === "/sitemap.xml" ||
        pathname === "/robots.txt" ||
        pathname === "/opengraph-image" ||
        pathname.endsWith(".ico") ||
        pathname.endsWith(".js") ||
        pathname.endsWith(".css") ||
        pathname.endsWith(".png") ||
        pathname.endsWith(".jpg") ||
        pathname.endsWith(".svg") ||
        pathname.endsWith(".xml") ||
        pathname.endsWith(".txt") ||
        pathname.endsWith(".woff2") ||
        pathname.endsWith(".json") ||
        pathname === "/manifest.json" ||
        pathname === "/site.webmanifest" ||
        pathname.startsWith("/downloads") ||
        pathname.endsWith(".exe") ||
        pathname.endsWith(".msi") ||
        pathname.endsWith(".sig")
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
        const loginUrl = new URL("/login", request.url);
        loginUrl.searchParams.set("redirect", pathname + request.nextUrl.search);
        return NextResponse.redirect(loginUrl);
    }

    try {
        await jwtVerify(token, SECRET);
        return NextResponse.next();
    } catch {
        if (isApiPath(pathname)) {
            return NextResponse.json({ error: "Invalid session" }, { status: 401 });
        }
        const loginUrl = new URL("/login", request.url);
        loginUrl.searchParams.set("redirect", pathname + request.nextUrl.search);
        return NextResponse.redirect(loginUrl);
    }
}

export const config = {
    matcher: ["/((?!_next/static|_next/image|favicon.ico|downloads).*)"],
};
