const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://anontweet.duckdns.org";
const LIVE_SERVER = process.env.NEXT_PUBLIC_LIVE_SERVER_URL || "http://localhost:3001";

const STATIC_ROUTES = [
  { url: "", priority: 1.0, changeFrequency: "daily" },
  { url: "/games", priority: 0.9, changeFrequency: "weekly" },
  { url: "/live", priority: 0.9, changeFrequency: "hourly" },
  { url: "/stories", priority: 0.8, changeFrequency: "daily" },
  { url: "/search", priority: 0.7, changeFrequency: "daily" },
  { url: "/call", priority: 0.6, changeFrequency: "monthly" },
  { url: "/privacy", priority: 0.5, changeFrequency: "yearly" },
  { url: "/terms", priority: 0.5, changeFrequency: "yearly" },
  { url: "/about", priority: 0.6, changeFrequency: "monthly" },
  { url: "/contact", priority: 0.5, changeFrequency: "yearly" },
];

async function getPublicPosts() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`${LIVE_SERVER}/api/posts?limit=200`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    clearTimeout(timeout);
    if (!res.ok) return [];
    const data = await res.json();
    const posts = Array.isArray(data?.posts) ? data.posts : [];
    return posts
      .map((p) => (p._id ? String(p._id) : null))
      .filter(Boolean);
  } catch {
    return [];
  }
}

export default async function sitemap() {
  const now = new Date();

  const staticEntries = STATIC_ROUTES.map((r) => ({
    url: `${BASE_URL}${r.url}`,
    lastModified: now,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }));

  const postIds = await getPublicPosts();
  const postEntries = postIds.map((id) => ({
    url: `${BASE_URL}/post/${id}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.6,
  }));

  // Trending hashtags (lightweight, best-effort)
  let hashtagEntries = [];
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`${LIVE_SERVER}/api/hashtags/trending?limit=50`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    clearTimeout(timeout);
    if (res.ok) {
      const data = await res.json();
      const tags = Array.isArray(data) ? data : (data?.tags || []);
      hashtagEntries = tags
        .map((t) => (typeof t === "string" ? t : t?.tag))
        .filter(Boolean)
        .map((tag) => ({
          url: `${BASE_URL}/search?q=${encodeURIComponent("#" + tag)}`,
          lastModified: now,
          changeFrequency: "daily",
          priority: 0.5,
        }));
    }
  } catch {
    hashtagEntries = [];
  }

  return [...staticEntries, ...postEntries, ...hashtagEntries];
}
