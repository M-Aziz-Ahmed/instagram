const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://anontweet.vercel.app";

export default function robots() {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/login",
        "/profile",
        "/bookmarks",
        "/referrals",
        "/admin",
        "/invite/",
        "/post/",
        "/messages",
      ],
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
    host: BASE_URL,
  };
}
