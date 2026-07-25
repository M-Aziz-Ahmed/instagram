/** @type {import('next').NextConfig} */
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
        return [
            {
                source: "/api/:path*",
                destination: "https://anontweet.duckdns.org/api/:path*",
            },
        ];
    },
};

export default nextConfig;
