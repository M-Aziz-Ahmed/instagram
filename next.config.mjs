export default (phase, { defaultConfig }) => {
    const liveTarget = process.env.NEXT_PUBLIC_LIVE_SERVER_URL || "https://anontweet.duckdns.org";

    const nextConfig = {
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
        productionBrowserSourceMaps: true,
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

    return defaultConfig ? defaultConfig(nextConfig) : nextConfig;
};
