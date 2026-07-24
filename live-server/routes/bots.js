const express = require("express");
const Bot = require("../models/bot");
const Post = require("../models/post");
const User = require("../models/user");
const { verifyToken } = require("../middleware/auth");
const { getRandomNewsForTopic, FEEDS } = require("../newsService");

const router = express.Router();

const COMMENTARY = {
    casual: [
        "Just came across this 👀",
        "Thoughts on this?",
        "Anyone else seeing this?",
        "Interesting stuff",
        "Had to share this one",
        "Worth reading 👇",
        "This caught my eye today",
        "Not gonna lie, this is wild",
        "Can't believe this is real",
        "My feed has been wild today",
    ],
    professional: [
        "Key insight worth noting:",
        "Analysis worth reading:",
        "Important development to track:",
        "Industry context:",
        "Data-driven perspective:",
        "Noteworthy trend:",
        "Strategic implications:",
    ],
    funny: [
        "my algorithm is absolutely cooking today 💀",
        "the simulation is getting wild again",
        "tell me why this is actually insane tho",
        "adding this to the list of things I didn't expect today",
        "the vibes are immaculate",
        "we live in the funniest timeline",
        "no because this is actually important lol",
    ],
    news: [
        "Breaking:",
        "Developing story:",
        "Just in:",
        "Report:",
        "Update:",
        "Key development:",
        "Trending now:",
    ],
    hype: [
        "THIS IS HUGE 🔥",
        "YO CHECK THIS OUT",
        "ABSOLUTELY INSANE",
        "WE ARE SO BACK",
        "THE FUTURE IS NOW",
        "THIS CHANGES EVERYTHING",
        "LET'S GOOO",
    ],
};

function buildPost(article, style) {
    const lines = COMMENTARY[style] || COMMENTARY.casual;
    const commentary = lines[Math.floor(Math.random() * lines.length)];

    const hashtag = article.topic
        ? `#${article.topic.toLowerCase().replace(/[^a-z0-9]+/g, "")}`
        : "";

    const sourceTag = article.source ? `via ${article.source}` : "";

    let text = "";
    if (style === "news") {
        text = `${article.title}\n\n${article.description ? article.description.slice(0, 200) : ""}`;
        if (sourceTag) text += `\n\n${sourceTag}`;
    } else if (style === "professional") {
        text = `${commentary}\n\n${article.title}`;
        if (article.description) text += `\n${article.description.slice(0, 180)}`;
        if (sourceTag) text += `\n\n${sourceTag}`;
    } else if (style === "hype") {
        text = `${commentary}\n\n${article.title}`;
        if (hashtag) text += `\n${hashtag}`;
    } else {
        text = `${commentary}\n\n${article.title}`;
        if (article.description) {
            const desc = article.description.slice(0, 150);
            text += `\n${desc}${article.description.length > 150 ? "..." : ""}`;
        }
        if (hashtag) text += `\n${hashtag}`;
    }

    return { text, image: article.image || null, hashtag };
}

// GET / — list all bots
router.get("/", verifyToken, async (req, res) => {
    try {
        const bots = await Bot.find({}).sort({ createdAt: -1 }).lean();
        return res.json(bots);
    } catch (error) {
        console.error("[bots] Error:", error.message);
        return res.status(500).json({ error: "Failed" });
    }
});

// GET /topics — available topic categories with feed info
router.get("/topics", verifyToken, (req, res) => {
    const topics = Object.keys(FEEDS).map((t) => ({
        name: t,
        feedCount: FEEDS[t].length,
    }));
    return res.json(topics);
});

// GET /:id — single bot
router.get("/:id", verifyToken, async (req, res) => {
    try {
        const bot = await Bot.findById(req.params.id).lean();
        if (!bot) return res.status(404).json({ error: "Bot not found" });
        return res.json(bot);
    } catch (error) {
        console.error("[bots] Error:", error.message);
        return res.status(500).json({ error: "Failed" });
    }
});

// POST /preview — preview what a bot would post from a topic
router.post("/preview", verifyToken, async (req, res) => {
    try {
        const { topic, style } = req.body;
        if (!topic) return res.status(400).json({ error: "Topic required" });
        const article = await getRandomNewsForTopic(topic);
        if (!article) return res.status(404).json({ error: "No news found for this topic" });
        const post = buildPost({ ...article, topic }, style || "casual");
        return res.json(post);
    } catch (error) {
        console.error("[bots] Preview error:", error.message);
        return res.status(500).json({ error: "Failed" });
    }
});

// POST / — create a bot
router.post("/", verifyToken, async (req, res) => {
    try {
        const { name, username, bio, avatarColor, topics, style, postsPerDay, postTimes, useRealNews, includeImages } = req.body;
        if (!name || !username) {
            return res.status(400).json({ error: "Name and username required" });
        }
        const existing = await Bot.findOne({ username: username.toLowerCase() });
        if (existing) {
            return res.status(400).json({ error: "Username already taken" });
        }
        const existingUser = await User.findOne({ username: username.toLowerCase() });
        if (existingUser) {
            return res.status(400).json({ error: "Username conflicts with a real user" });
        }
        const bot = await Bot.create({
            name,
            username: username.toLowerCase(),
            bio: bio || `I post about ${topics?.join(", ") || "various topics"} 🤖`,
            avatarColor: avatarColor || "#10b981",
            topics: topics || [],
            style: style || "casual",
            useRealNews: useRealNews !== false,
            includeImages: includeImages !== false,
            postsPerDay: Math.min(Math.max(parseInt(postsPerDay) || 1, 1), 10),
            postTimes: postTimes?.length ? postTimes : ["09:00"],
            createdBy: req.session?.userId || "admin",
        });
        return res.json(bot);
    } catch (error) {
        console.error("[bots] Error:", error.message);
        return res.status(500).json({ error: "Failed" });
    }
});

// PATCH /:id — update a bot
router.patch("/:id", verifyToken, async (req, res) => {
    try {
        const bot = await Bot.findById(req.params.id);
        if (!bot) return res.status(404).json({ error: "Bot not found" });
        const { name, bio, avatarColor, topics, style, postsPerDay, postTimes, useRealNews, includeImages } = req.body;
        if (name !== undefined) bot.name = name;
        if (bio !== undefined) bot.bio = bio;
        if (avatarColor !== undefined) bot.avatarColor = avatarColor;
        if (topics !== undefined) bot.topics = topics;
        if (style !== undefined) bot.style = style;
        if (postsPerDay !== undefined) bot.postsPerDay = Math.min(Math.max(parseInt(postsPerDay) || 1, 1), 10);
        if (postTimes !== undefined) bot.postTimes = postTimes;
        if (useRealNews !== undefined) bot.useRealNews = useRealNews;
        if (includeImages !== undefined) bot.includeImages = includeImages;
        await bot.save();
        return res.json(bot);
    } catch (error) {
        console.error("[bots] Error:", error.message);
        return res.status(500).json({ error: "Failed" });
    }
});

// PATCH /:id/toggle — activate/deactivate
router.patch("/:id/toggle", verifyToken, async (req, res) => {
    try {
        const bot = await Bot.findById(req.params.id);
        if (!bot) return res.status(404).json({ error: "Bot not found" });
        bot.active = !bot.active;
        await bot.save();
        return res.json(bot);
    } catch (error) {
        console.error("[bots] Error:", error.message);
        return res.status(500).json({ error: "Failed" });
    }
});

// DELETE /:id — delete a bot
router.delete("/:id", verifyToken, async (req, res) => {
    try {
        const bot = await Bot.findByIdAndDelete(req.params.id);
        if (!bot) return res.status(404).json({ error: "Bot not found" });
        return res.json({ ok: true });
    } catch (error) {
        console.error("[bots] Error:", error.message);
        return res.status(500).json({ error: "Failed" });
    }
});

// POST /:id/post-now — force a bot to post immediately (real news)
router.post("/:id/post-now", verifyToken, async (req, res) => {
    try {
        const bot = await Bot.findById(req.params.id);
        if (!bot) return res.status(404).json({ error: "Bot not found" });
        if (!bot.topics.length) return res.status(400).json({ error: "Bot has no topics" });

        const topic = bot.topics[Math.floor(Math.random() * bot.topics.length)];
        const article = await getRandomNewsForTopic(topic);
        if (!article) return res.status(404).json({ error: `No news found for "${topic}". Try again later.` });

        const post = buildPost({ ...article, topic }, bot.style);

        const botUser = await User.findOne({ username: bot.username });
        if (!botUser) return res.status(400).json({ error: "Bot user account not found" });

        const postData = {
            text: post.text,
            sender: bot.username,
            color: bot.avatarColor,
            hashtags: [topic.toLowerCase().replace(/[^a-z0-9]+/g, "")].filter(Boolean),
        };
        if (bot.includeImages && post.image) {
            postData.imageUrl = post.image;
        }

        const createdPost = await Post.create(postData);
        bot.lastPostedAt = new Date();
        bot.totalPosts += 1;
        await bot.save();
        return res.json({ post: createdPost, article, bot });
    } catch (error) {
        console.error("[bots] Error:", error.message);
        return res.status(500).json({ error: "Failed" });
    }
});

// POST /seed-defaults — create default bots + user accounts
router.post("/seed-defaults", verifyToken, async (req, res) => {
    try {
        const defaultBots = [
            { name: "Tech Daily", username: "techdaily", bio: "Your daily dose of real tech news from top sources 🤖", style: "news", topics: ["technology", "ai and machine learning", "web development", "cybersecurity"], postsPerDay: 3, postTimes: ["09:00", "14:00", "20:00"], avatarColor: "#3b82f6", useRealNews: true, includeImages: true },
            { name: "Space Explorer", username: "spaceexplorer", bio: "Blast off into the cosmos with real space news! 🚀", style: "hype", topics: ["space exploration", "renewable energy", "virtual reality"], postsPerDay: 2, postTimes: ["10:00", "18:00"], avatarColor: "#8b5cf6", useRealNews: true, includeImages: true },
            { name: "Chill Vibes", username: "chillvibes", bio: "Real stories about health, food, travel, and life", style: "casual", topics: ["health and wellness", "cooking trends", "travel destinations", "pet trends", "book recommendations"], postsPerDay: 2, postTimes: ["11:00", "19:00"], avatarColor: "#10b981", useRealNews: true, includeImages: true },
            { name: "Meme Machine", username: "mememachine", bio: "Gaming, music, movies — the internet culture pulse 💀", style: "funny", topics: ["gaming news", "social media trends", "music releases", "movie trailers"], postsPerDay: 3, postTimes: ["12:00", "17:00", "22:00"], avatarColor: "#f59e0b", useRealNews: true, includeImages: true },
            { name: "Market Watch", username: "marketwatch", bio: "Financial insights and market news in real time 📊", style: "professional", topics: ["crypto markets", "startups", "electric vehicles", "sustainability"], postsPerDay: 2, postTimes: ["08:00", "16:00"], avatarColor: "#ef4444", useRealNews: true, includeImages: true },
        ];

        const created = [];
        for (const b of defaultBots) {
            const existing = await Bot.findOne({ username: b.username });
            if (existing) continue;
            const userExists = await User.findOne({ username: b.username });
            if (!userExists) {
                await User.create({
                    email: `${b.username}@anon.bot`,
                    username: b.username,
                    bio: b.bio,
                    avatarColor: b.avatarColor,
                    isAdmin: false,
                });
            }
            const bot = await Bot.create({ ...b, createdBy: "system" });
            created.push(bot.username);
        }
        return res.json({ created, message: `Seeded ${created.length} bot(s) with real news enabled` });
    } catch (error) {
        console.error("[bots] seed error:", error.message);
        return res.status(500).json({ error: "Failed" });
    }
});

// Auto-post function (called by setInterval in server.js)
async function runBotPosts() {
    try {
        const now = new Date();
        const currentHour = now.getHours().toString().padStart(2, "0");
        const currentMinute = now.getMinutes().toString().padStart(2, "0");
        const currentTime = `${currentHour}:${currentMinute}`;

        const activeBots = await Bot.find({ active: true, topics: { $exists: true, $ne: [] } });
        let posted = 0;

        for (const bot of activeBots) {
            if (!bot.postTimes?.includes(currentTime)) continue;

            const todayStr = now.toISOString().slice(0, 10);
            const lastPosted = bot.lastPostedAt ? new Date(bot.lastPostedAt) : null;
            if (lastPosted && lastPosted.toISOString().slice(0, 10) === todayStr) {
                const postsToday = await Post.countDocuments({
                    sender: bot.username,
                    timeStamp: { $gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()) },
                });
                if (postsToday >= bot.postsPerDay) continue;
            }

            const topic = bot.topics[Math.floor(Math.random() * bot.topics.length)];

            let postData = {
                sender: bot.username,
                color: bot.avatarColor,
                hashtags: [topic.toLowerCase().replace(/[^a-z0-9]+/g, "")].filter(Boolean),
            };

            if (bot.useRealNews) {
                const article = await getRandomNewsForTopic(topic);
                if (!article) {
                    console.log(`[Bots] No news for ${bot.username} on "${topic}", skipping`);
                    continue;
                }
                const post = buildPost({ ...article, topic }, bot.style);
                postData.text = post.text;
                if (bot.includeImages && post.image) {
                    postData.imageUrl = post.image;
                }
            } else {
                postData.text = `Random thought about ${topic}... more updates coming soon!`;
            }

            const botUser = await User.findOne({ username: bot.username });
            if (!botUser) continue;

            await Post.create(postData);
            bot.lastPostedAt = now;
            bot.totalPosts += 1;
            await bot.save();
            posted++;
        }

        return posted;
    } catch (error) {
        console.error("[bots] Auto-post error:", error.message);
        return 0;
    }
}

module.exports = router;
module.exports.runBotPosts = runBotPosts;
