const express = require("express");
const Bot = require("../models/bot");
const Post = require("../models/post");
const User = require("../models/user");
const { verifyToken } = require("../middleware/auth");

const router = express.Router();

const BOT_TEMPLATES = {
    casual: [
        "Just saw something interesting today... {topic} is really evolving. What do you all think?",
        "Anyone else following {topic}? The latest developments are wild 🤯",
        "Hot take on {topic} — change my mind.",
        "Can we talk about {topic} for a second? I have thoughts.",
        "Not gonna lie, {topic} has been on my mind all day. Thoughts?",
        "PSA: If you're not paying attention to {topic}, you're missing out.",
        "Unpopular opinion about {topic}: it's more important than people think.",
        "Been researching {topic} all morning. Here's what I found interesting...",
        "The {topic} discourse online is getting out of hand lol",
        "Friendly reminder that {topic} exists and it matters.",
    ],
    professional: [
        "Analysis: {topic} continues to show significant momentum. Key indicators suggest...",
        "The {topic} landscape is shifting. Here are the main takeaways:",
        "Breaking down the latest in {topic} — what professionals are saying:",
        "New developments in {topic} worth noting. Industry implications are substantial.",
        "Data point: {topic} metrics are trending upward. Full breakdown below.",
        "Expert consensus on {topic} is forming. Here's the current state of play.",
        "Deep dive: Understanding the nuances of {topic} in today's environment.",
        "Market update: {topic} is generating significant attention from stakeholders.",
        "The intersection of {topic} and broader trends deserves closer examination.",
        "Quarterly look: {topic} performance and outlook remain strong.",
    ],
    funny: [
        "Me explaining to my friends why {topic} matters for the 47th time 😂",
        "POV: You just discovered {topic} and now it's your entire personality",
        "Tell me you follow {topic} without telling me you follow {topic} 🙃",
        "The {topic} fandom is unhinged and I'm here for it",
        "My algorithm keeps showing me {topic} content and honestly... fair enough",
        "That moment when {topic} hits different at 3am 💀",
        "Plot twist: {topic} was the friends we made along the way",
        "No because why is {topic} actually interesting though?? I didn't ask for this",
        "Starting a support group for people obsessed with {topic}. Meetings Tuesdays.",
        "The way {topic} lives rent-free in my head is concerning",
    ],
    news: [
        "📰 Trending: {topic} is making headlines today. Here's what you need to know.",
        "⚡ Quick update on {topic} — major developments emerging.",
        "📢 {topic} alert: Something significant just happened. Details below.",
        "🔍 In focus: {topic} — a comprehensive look at what's happening right now.",
        "📊 {topic} update: Numbers are in and they're telling an interesting story.",
        "🚨 Breaking: {topic} developments you shouldn't miss.",
        "💡 Spotlight on {topic}: Why this matters right now.",
        "📌 Key takeaway: {topic} is evolving faster than expected.",
        "🌍 Global perspective: How {topic} is shaping conversations everywhere.",
        "⏳ Don't sleep on {topic} — here's why it matters today.",
    ],
    hype: [
        "🔥 {topic} is absolutely CRUSHING it right now!!! Let's goooo!",
        "🚀 {topic} TO THE MOON! Who else is hyped?!",
        "⚡ WAKE UP everyone! {topic} just dropped something HUGE!",
        "💎 {topic} gems incoming! This is NOT a drill!",
        "🎉 BIG {topic} energy today! The vibes are immaculate!",
        "💥 {topic} just went CRAZY! You love to see it!",
        "🏆 {topic} supremacy! We are SO back!",
        "✨ Major {topic} W today! The haters are QUIET!",
        "🌟 {topic} moment of the day! This is what we've been waiting for!",
        "👊 {topic} winning nonstop! Get on board or get left behind!",
    ],
};

const DEFAULT_TOPICS = [
    "technology", "AI and machine learning", "space exploration",
    "climate change", "crypto markets", "gaming news",
    "music releases", "movie trailers", "sports highlights",
    "social media trends", "health and wellness", "startups",
    "web development", "cybersecurity", "electric vehicles",
    "cooking trends", "fitness challenges", "travel destinations",
    "book recommendations", "pet trends", "sustainability",
    "virtual reality", "blockchain", "renewable energy",
];

function pickTemplate(style, topic) {
    const templates = BOT_TEMPLATES[style] || BOT_TEMPLATES.casual;
    const template = templates[Math.floor(Math.random() * templates.length)];
    return template.replace(/\{topic\}/g, topic);
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

// GET /topics — available topic categories
router.get("/topics", verifyToken, (req, res) => {
    return res.json(DEFAULT_TOPICS);
});

// GET /templates — bot style templates preview
router.get("/templates", verifyToken, (req, res) => {
    return res.json(BOT_TEMPLATES);
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

// POST / — create a bot
router.post("/", verifyToken, async (req, res) => {
    try {
        const { name, username, bio, avatarColor, topics, style, postsPerDay, postTimes } = req.body;
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
        const { name, bio, avatarColor, topics, style, postsPerDay, postTimes } = req.body;
        if (name !== undefined) bot.name = name;
        if (bio !== undefined) bot.bio = bio;
        if (avatarColor !== undefined) bot.avatarColor = avatarColor;
        if (topics !== undefined) bot.topics = topics;
        if (style !== undefined) bot.style = style;
        if (postsPerDay !== undefined) bot.postsPerDay = Math.min(Math.max(parseInt(postsPerDay) || 1, 1), 10);
        if (postTimes !== undefined) bot.postTimes = postTimes;
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

// POST /:id/post-now — force a bot to post immediately
router.post("/:id/post-now", verifyToken, async (req, res) => {
    try {
        const bot = await Bot.findById(req.params.id);
        if (!bot) return res.status(404).json({ error: "Bot not found" });
        if (!bot.topics.length) return res.status(400).json({ error: "Bot has no topics" });
        const topic = bot.topics[Math.floor(Math.random() * bot.topics.length)];
        const text = pickTemplate(bot.style, topic);
        const botUser = await User.findOne({ username: bot.username });
        if (!botUser) return res.status(400).json({ error: "Bot user account not found — create the bot user first" });
        const post = await Post.create({
            text,
            sender: bot.username,
            color: bot.avatarColor,
            hashtags: [topic.toLowerCase().replace(/\s+/g, "").replace(/[^a-z0-9]/g, "")].filter(Boolean),
        });
        bot.lastPostedAt = new Date();
        bot.totalPosts += 1;
        await bot.save();
        return res.json({ post, bot });
    } catch (error) {
        console.error("[bots] Error:", error.message);
        return res.status(500).json({ error: "Failed" });
    }
});

// POST /seed-defaults — create default bots + user accounts
router.post("/seed-defaults", verifyToken, async (req, res) => {
    try {
        const defaultBots = [
            { name: "Tech Daily", username: "techdaily", bio: "Your daily dose of tech news and trends 🤖", style: "news", topics: ["technology", "AI and machine learning", "web development", "cybersecurity"], postsPerDay: 3, postTimes: ["09:00", "14:00", "20:00"], avatarColor: "#3b82f6" },
            { name: "Space Explorer", username: "spaceexplorer", bio: "Blast off into the cosmos! 🚀", style: "hype", topics: ["space exploration", "renewable energy", "virtual reality"], postsPerDay: 2, postTimes: ["10:00", "18:00"], avatarColor: "#8b5cf6" },
            { name: "Chill Vibes", username: "chillvibes", bio: "Keeping it real with casual takes on everything", style: "casual", topics: ["health and wellness", "cooking trends", "travel destinations", "pet trends", "book recommendations"], postsPerDay: 2, postTimes: ["11:00", "19:00"], avatarColor: "#10b981" },
            { name: "Meme Machine", username: "mememachine", bio: "Internet culture commentator. Professional shitposter.", style: "funny", topics: ["gaming news", "social media trends", "music releases", "movie trailers"], postsPerDay: 3, postTimes: ["12:00", "17:00", "22:00"], avatarColor: "#f59e0b" },
            { name: "Market Watch", username: "marketwatch", bio: "Financial insights and market trends 📊", style: "professional", topics: ["crypto markets", "startups", "electric vehicles", "sustainability"], postsPerDay: 2, postTimes: ["08:00", "16:00"], avatarColor: "#ef4444" },
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
        return res.json({ created, message: `Seeded ${created.length} bot(s)` });
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
            const lastPosted = bot.lastPostedAt ? new Date(bot.lastPostedAt) : null;
            const todayStr = now.toISOString().slice(0, 10);
            if (lastPosted && lastPosted.toISOString().slice(0, 10) === todayStr) {
                const postsToday = await Post.countDocuments({
                    sender: bot.username,
                    timeStamp: { $gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()) },
                });
                if (postsToday >= bot.postsPerDay) continue;
            }

            const topic = bot.topics[Math.floor(Math.random() * bot.topics.length)];
            const text = pickTemplate(bot.style, topic);

            const botUser = await User.findOne({ username: bot.username });
            if (!botUser) continue;

            await Post.create({
                text,
                sender: bot.username,
                color: bot.avatarColor,
                hashtags: [topic.toLowerCase().replace(/\s+/g, "").replace(/[^a-z0-9]/g, "")].filter(Boolean),
            });

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
