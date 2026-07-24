const RSSParser = require("rss-parser");
const parser = new RSSParser({
    timeout: 10000,
    headers: {
        "User-Agent": "AnonTweet/1.0 (https://anontweet.app)",
        Accept: "application/rss+xml, application/xml, text/xml",
    },
});

const FEEDS = {
    technology: [
        "https://feeds.arstechnica.com/arstechnica/technology-lab",
        "https://www.theverge.com/rss/index.xml",
        "https://www.techmeme.com/feed.xml",
        "https://feeds.feedburner.com/TechCrunch/",
        "https://www.wired.com/feed/rss",
    ],
    "ai and machine learning": [
        "https://feeds.feedburner.com/TheHackersNews",
        "https://www.artificialintelligence-news.com/feed/",
        "https://venturebeat.com/category/ai/feed/",
    ],
    "space exploration": [
        "https://www.nasa.gov/news-release/feed/",
        "https://phys.org/rss-feed/space-news/",
        "https://spacenews.com/feed/",
    ],
    "climate change": [
        "https://www.carbonbrief.org/feed/",
        "https://climatenews.com/feed/",
        "https://www.theguardian.com/environment/climate-crisis/rss",
    ],
    "crypto markets": [
        "https://cointelegraph.com/rss",
        "https://www.coindesk.com/arc/outboundfeeds/rss/",
        "https://cryptonews.com/news/feed/",
    ],
    "gaming news": [
        "https://www.ign.com/rss/articles",
        "https://www.gamespot.com/feeds/mashup/",
        "https://www.polygon.com/rss/index.xml",
    ],
    "music releases": [
        "https://pitchfork.com/rss/reviews/albums/",
        "https://www.billboard.com/feed/",
    ],
    "movie trailers": [
        "https://www.collider.com/feed/",
        "https://www.slashfilm.com/feed/",
    ],
    "sports highlights": [
        "https://www.espn.com/espn/rss/news",
        "https://www.bbc.com/sport/rss.xml",
    ],
    "social media trends": [
        "https://www.socialmediatoday.com/rss.xml",
        "https://thenextweb.com/feed",
    ],
    "health and wellness": [
        "https://www.medicalnewstoday.com/news/rss",
        "https://www.healthline.com/rss",
    ],
    startups: [
        "https://techcrunch.com/category/startups/feed/",
        "https://www.crunchbase.com/feed",
    ],
    "web development": [
        "https://dev.to/feed",
        "https://css-tricks.com/feed/",
        "https://www.smashingmagazine.com/feed/",
    ],
    cybersecurity: [
        "https://feeds.feedburner.com/TheHackersNews",
        "https://www.bleepingcomputer.com/feed/",
        "https://krebsonsecurity.com/feed/",
    ],
    "electric vehicles": [
        "https://electrek.co/feed/",
        "https://insideevs.com/rss/news/",
    ],
    "cooking trends": [
        "https://www.seriouseats.com/feeds/rss",
        "https://www.eater.com/rss/index.xml",
    ],
    "travel destinations": [
        "https://www.lonelyplanet.com/blog/feed",
        "https://www.travelandleisure.com/feed",
    ],
    "book recommendations": [
        "https://www.goodreads.com/reviews/rss",
        "https://bookriot.com/feed/",
    ],
    "pet trends": [
        "https://www.animalplanet.com/rss.xml",
    ],
    sustainability: [
        "https://www.greenbiz.com/feed",
        "https://www.treehugger.com/rss",
    ],
    "virtual reality": [
        "https://uploadvr.com/feed/",
        "https://www.roadtovr.com/feed/",
    ],
    blockchain: [
        "https://cointelegraph.com/rss",
        "https://www.coindesk.com/arc/outboundfeeds/rss/",
    ],
    "renewable energy": [
        "https://cleantechnica.com/feed/",
        "https://www.pv-magazine.com/feed/",
    ],
};

const FALLBACK_FEEDS = [
    "https://www.reddit.com/r/news/.rss",
    "https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml",
];

function extractImage(item) {
    if (item.enclosure && item.enclosure.url) return item.enclosure.url;
    if (item["media:thumbnail"] && item["media:thumbnail"]["$"]) return item["media:thumbnail"]["$"].url;
    if (item["media:content"] && item["media:content"]["$"]) return item["media:content"]["$"].url;
    const content = item.content || item.contentSnippet || "";
    const imgMatch = content.match(/<img[^>]+src=["']([^"']+)["']/);
    if (imgMatch) return imgMatch[1];
    return null;
}

function cleanText(text) {
    if (!text) return "";
    return text
        .replace(/<[^>]+>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

async function fetchFromFeed(feedUrl) {
    try {
        const feed = await parser.parseURL(feedUrl);
        return (feed.items || []).map((item) => ({
            title: cleanText(item.title),
            description: cleanText(item.contentSnippet || item.content || ""),
            link: item.link,
            image: extractImage(item),
            pubDate: item.pubDate,
            source: feed.title || new URL(feedUrl).hostname,
        }));
    } catch (err) {
        console.error(`[news] Failed to fetch ${feedUrl}:`, err.message);
        return [];
    }
}

async function fetchNewsForTopic(topic, limit = 5) {
    const feeds = FEEDS[topic.toLowerCase()] || [];
    if (feeds.length === 0) {
        const fallbackResults = await Promise.allSettled(
            FALLBACK_FEEDS.map((f) => fetchFromFeed(f))
        );
        const all = fallbackResults
            .filter((r) => r.status === "fulfilled")
            .flatMap((r) => r.value);
        return all.slice(0, limit);
    }

    const results = await Promise.allSettled(
        feeds.map((f) => fetchFromFeed(f))
    );
    const all = results
        .filter((r) => r.status === "fulfilled")
        .flatMap((r) => r.value);

    const seen = new Set();
    const unique = all.filter((item) => {
        if (!item.title || seen.has(item.title)) return false;
        seen.add(item.title);
        return true;
    });

    return unique.slice(0, limit);
}

async function getRandomNewsForTopic(topic) {
    const articles = await fetchNewsForTopic(topic, 10);
    if (articles.length === 0) return null;
    return articles[Math.floor(Math.random() * articles.length)];
}

async function getMultipleNews(topics, count = 3) {
    const results = [];
    const shuffled = [...topics].sort(() => Math.random() - 0.5);
    for (const topic of shuffled) {
        if (results.length >= count) break;
        const article = await getRandomNewsForTopic(topic);
        if (article) results.push({ ...article, topic });
    }
    return results;
}

module.exports = {
    fetchNewsForTopic,
    getRandomNewsForTopic,
    getMultipleNews,
    FEEDS,
};
