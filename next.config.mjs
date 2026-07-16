/** @type {import('next').NextConfig} */
const nextConfig = {
    images: {
        remotePatterns: [
            {
                protocol: "https",
                hostname: "res.cloudinary.com",
            },
        ],
    },
  allowedDevOrigins: ['39.62.217.128','0.0.0.0','dad-phrases-removable-car.trycloudflare.com'],
    productionBrowserSourceMaps: true,
};

export default nextConfig;
