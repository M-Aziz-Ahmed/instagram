import { NextResponse } from "next/server";
import { jwtVerify } from "jose";

const SECRET = new TextEncoder().encode(
    process.env.JWT_SECRET || "anonfeed_jwt_secret_change_in_production_32chars"
);

const PUBLIC_PATHS = [
    "/",
    "/login",
    "/social",
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
    // Movie Hub — the merged watch surface. Must be public for the same reason
    // the category routes above are: the legacy paths redirect here, so a
    // logged-out visitor following /anime or /cartoons would otherwise be bounced
    // to /login on arrival.
    "/watch",
    "/library",
    // Reels is a feed surface: reachable when signed out so the page can show
    // its own sign-in prompt, exactly like /social.
    "/reels",
    "/api/auth",
    "/api/posts",
    "/api/search",
    "/api/ads",
    "/api/tts",
    "/api/trending",
    "/api/hashtags",
    "/api/anime-proxy",
    // Analytics event ingestion must be reachable by signed-out viewers, or
    // impressions from the anonymous majority are never recorded. Passing the
    // proxy does not weaken the dashboard: GET /api/analytics still verifies
    // ownership or admin in the route itself.
    "/api/analytics",
    // NOTE: /browser and /api/browser are deliberately NOT public.
    // /api/browser turns this server into an open relay for arbitrary
    // third-party sites, so it now requires a session and the `use_browser`
    // role permission (enforced in app/api/browser/route.js via
    // utils/browserAccess.js). /browser itself just redirects to
    // /me/tools/browser.
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

export async function proxy(request) {
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
