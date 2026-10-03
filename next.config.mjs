export default (phase, { defaultConfig }) => {
    const liveTarget = process.env.NEXT_PUBLIC_LIVE_SERVER_URL || "https://anontweet.duckdns.org";

    // The desktop app ships the whole Next server inside the installer and runs it
    // as a local sidecar, so it needs the self-contained `standalone` output. Static
    // export is not an option: rewrites, headers and the dynamic routes all need a
    // real server. Gated behind DESKTOP_BUILD so the Vercel build stays identical.
    const isDesktopBuild = process.env.DESKTOP_BUILD === "1";

    return {
        ...(isDesktopBuild ? { output: "standalone" } : {}),
        images: {
            remotePatterns: [
                {
                    protocol: "https",
                    hostname: "res.cloudinary.com",
                },
                {
                    protocol: "https",
                    hostname: "static.tvmaze.com",
                },
                {
                    protocol: "https",
                    hostname: "img.anili.st",
                },
                {
                    protocol: "https",
                    hostname: "cdn.anipixcdn.co",
                },
                {
                    protocol: "https",
                    hostname: "uploads.mangadex.org",
                },
                {
                    protocol: "https",
                    hostname: "cdn.animepixcdn.co",
                },
            ],
        },
        allowedDevOrigins: ['39.62.217.128','0.0.0.0','dad-phrases-removable-car.trycloudflare.com'],
        // Browser source maps roughly double the shipped JS. Vercel uses them for
        // error reporting, so they stay on there and off for the desktop bundle.
        productionBrowserSourceMaps: !isDesktopBuild,
        async headers() {
            return [
                {
                    // The service worker carries the push, notificationclick and
                    // notificationaction handlers, so a cached copy of this file
                    // is a cached copy of the notification behaviour. Left to the
                    // default HTTP caching, a deploy of a fix to it can take up to
                    // 24h to reach a browser, which is indistinguishable from the
                    // fix not working. `no-store` plus the `updateViaCache: 'none'`
                    // registration in app/providers.jsx close that gap.
                    source: "/sw.js",
                    headers: [
                        { key: "Content-Type", value: "application/javascript; charset=utf-8" },
                        { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
                    ],
                },
            ];
        },
        async rewrites() {
            return {
                beforeFiles: [
                    {
                        source: "/sio/:path*",
                        destination: `${liveTarget}/sio/:path*`,
                    },
                ],
                afterFiles: [
                    {
                        source: "/api/:path*",
                        destination: `${liveTarget}/api/:path*`,
                    },
                ],
            };
        },
    };
};
