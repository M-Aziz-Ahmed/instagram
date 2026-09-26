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
        "/me/",
        "/bookmarks",
        "/library",
        "/referrals",
        "/admin",
        "/analytics",
        "/inbox",
        "/invite/",
        "/post/",
        "/messages",
        // Personalized, infinite-scroll video feed: nothing here is worth
        // indexing and every URL resolves to the same signed-in shell.
        "/reels",
      ],
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
    host: BASE_URL,
  };
}
