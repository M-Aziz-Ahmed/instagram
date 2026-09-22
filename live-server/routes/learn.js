const express = require("express");
const mongoose = require("mongoose");
const LearnUser = require("../models/learnUser");
const LearnLeague = require("../models/learnLeague");
const User = require("../models/user");
const Notification = require("../models/notification");
const { verifyToken } = require("../middleware/auth");
const { LANGUAGE_CATALOG, COURSES } = require("../learnContent");
const {
    LEAGUE_TIERS, LEAGUE_SIZE, PROMOTE_N, RELEGATE_N,
    HEARTS_REFILL_COST, STREAK_FREEZE_COST, STREAK_REPAIR_COST, TIP_FRIEND_COST, COMEBACK_BONUS_GEMS,
    todayKey, seasonKey, regenHearts, levelProgress,
    buildQuestions, buildDailyQuests, checkAchievements, ACHIEVEMENTS,
} = require("../learnHelpers");

const router = express.Router();

const catalogById = Object.fromEntries(LANGUAGE_CATALOG.map((l) => [l.id, l]));
const DAY_MS = 24 * 60 * 60 * 1000;

function parseDay(s) {
    const [y, m, d] = (s || "").split("-").map(Number);
    return new Date(y, m - 1, d);
}

function daysBetween(a, b) {
    return Math.round((parseDay(b) - parseDay(a)) / DAY_MS);
}

async function getUser(userId) {
    return LearnUser.findOne({ userId });
}

async function ensureUser(req) {
    const user = await User.findById(req.userId).lean();
    if (!user) return null;
    let lu = await LearnUser.findOne({ userId: req.userId });
    if (!lu) {
        lu = await LearnUser.create({
            userId: req.userId,
            username: user.username || "",
            dailyDate: "",
            quests: [],
        });
    }
    if (lu.username !== (user.username || "")) {
        lu.username = user.username || "";
        await lu.save();
    }
    return lu;
}

function nextMonday(d = new Date()) {
    const day = new Date(d);
    const dow = (day.getDay() + 6) % 7;
    day.setDate(day.getDate() - dow + 7);
    day.setHours(0, 0, 0, 0);
    return day;
}

async function finalizeStaleLeague(lu) {
    const season = seasonKey();
    if (lu.league && lu.league.season && lu.league.season !== season) {
        const prev = lu.league;
        try {
            const leagueDoc = await LearnLeague.findById(prev.leagueId).lean();
            if (leagueDoc) {
                const me = leagueDoc.members.find((m) => String(m.userId) === String(lu.userId));
                const sorted = [...leagueDoc.members].sort((a, b) => b.xp - a.xp);
                const rank = sorted.findIndex((m) => String(m.userId) === String(lu.userId)) + 1;
                lu.lastSeason = { season: prev.season, tier: leagueDoc.tier, rank };
                let nextTier = leagueDoc.tier;
                if (rank > 0 && rank <= PROMOTE_N) {
                    nextTier = Math.min(LEAGUE_TIERS.length - 1, leagueDoc.tier + 1);
                    const prize = rank === 1 ? 100 : rank === 2 ? 50 : 25;
                    lu.gems += prize;
                } else if (rank >= LEAGUE_SIZE - RELEGATE_N + 1) {
                    nextTier = Math.max(0, leagueDoc.tier - 1);
                }
                lu.league = { season: "", tier: nextTier, leagueId: "", xp: 0, rank: -1 };
            } else {
                lu.league = { season: "", tier: Math.max(0, prev.tier - 1), leagueId: "", xp: 0, rank: -1 };
            }
        } catch {
            lu.league = { season: "", tier: 0, leagueId: "", xp: 0, rank: -1 };
        }
        await lu.save();
    }
}

async function ensureLeague(lu) {
    const season = seasonKey();
    if (lu.league && lu.league.season === season && lu.league.leagueId) {
        return lu.league;
    }
    const tier = lu.league && lu.league.tier != null ? lu.league.tier : 0;
    let leagueDoc = await LearnLeague.findOne({ season, tier, status: "active" })
        .sort({ createdAt: 1 })
        .lean();
    if (!leagueDoc || leagueDoc.members.length >= LEAGUE_SIZE) {
        leagueDoc = await LearnLeague.create({ season, tier, members: [] });
    }
    const user = await User.findById(lu.userId).select("username avatarColor avatarUrl").lean();
    await LearnLeague.updateOne(
        { _id: leagueDoc._id, "members.userId": { $ne: lu.userId } },
        { $push: { members: { userId: lu.userId, username: user?.username || lu.username, avatarColor: user?.avatarColor || "#3b82f6", avatarUrl: user?.avatarUrl || "" } } }
    );
    lu.league = { season, tier, leagueId: String(leagueDoc._id), xp: 0, rank: -1 };
    await lu.save();
    return lu.league;
}

// Add XP to the active league cohort.
async function addLeagueXp(lu, xp) {
    if (!lu.league || !lu.league.leagueId || lu.league.season !== seasonKey()) {
        await ensureLeague(lu);
    }
    if (!lu.league.leagueId) return;
    lu.league.xp += xp;
    await LearnLeague.updateOne(
        { _id: mongoose.Types.ObjectId.createFromHexString(lu.league.leagueId), "members.userId": lu.userId },
        { $inc: { "members.$.xp": xp }, $set: { "members.$.lastActive": new Date() } }
    );
}

async function resetDailyIfNeeded(lu, now = new Date()) {
    const today = todayKey(now);
    if (lu.dailyDate !== today) {
        lu.dailyXp = 0;
        lu.dailyDate = today;
        lu.quests = buildDailyQuests(`${lu.username || String(lu.userId)}:${today}`);
        await lu.save();
    }
}

function questDeltas(lu, { lessons = 0, xp = 0, perfect = 0, correct = 0 }) {
    for (const q of lu.quests || []) {
        if (q.done || q.claimed) continue;
        if (q.target === "lessons") q.progress += lessons;
        if (q.target === "xp") q.progress += xp;
        if (q.target === "perfect") q.progress += perfect;
        if (q.target === "correct") q.progress += correct;
    }
}

function markQuestDone(lu) {
    for (const q of lu.quests || []) {
        if (!q.done && q.progress >= q.goal) q.done = true;
    }
}

function applyStreak(lu, now = new Date()) {
    const today = todayKey(now);
    if (lu.streakLastDay === today) return;
    const last = lu.streakLastDay;
    let frozeUsed = false;
    if (!last) {
        lu.streak = 1;
    } else {
        const diff = daysBetween(last, today);
        if (diff === 1) {
            lu.streak += 1;
        } else if (diff > 1) {
            if (lu.streakFreezes > 0) {
                lu.streakFreezes -= 1;
                frozeUsed = true;
            } else {
                lu.streakBrokenAt = new Date();
                lu.streak = 1;
            }
        }
    }
    lu.streakLastDay = today;
    if (lu.streak > lu.longestStreak) lu.longestStreak = lu.streak;
    return { frozeUsed };
}

// Piece together the client-safe "me" object.
function buildMe(lu, user) {
    const lp = levelProgress(lu.xp);
    return {
        username: lu.username,
        xp: lu.xp,
        level: lp.level,
        levelCurrent: lp.current,
        levelNeeded: lp.needed,
        levelPct: lp.pct,
        gems: lu.gems,
        hearts: lu.hearts,
        maxHearts: 5,
        dailyXp: lu.dailyXp,
        dailyGoal: lu.dailyGoal,
        streak: lu.streak,
        longestStreak: lu.longestStreak,
        streakFreezes: lu.streakFreezes,
        streakBrokenAt: lu.streakBrokenAt,
        canRepairStreak: !!lu.streakBrokenAt && daysBetween(lu.streakBrokenAt ? todayKey(lu.streakBrokenAt) : "", todayKey()) <= 3,
        currentCourse: lu.currentCourse,
        courseProgress: Object.fromEntries(lu.courseProgress || new Map()),
        lessonsCompleted: lu.lessonsCompleted,
        perfectLessons: lu.perfectLessons,
        totalCorrect: lu.totalCorrect,
        totalAnswered: lu.totalAnswered,
        achievements: lu.achievements || [],
        quests: (lu.quests || []).map((q) => ({ ...q, desc: (q.desc || "").replace("{n}", q.goal) })),
        league: lu.league || { tier: 0 },
        lastSeason: lu.lastSeason || null,
        comebackSent: lu.comebackSent || [],
        avatarColor: user?.avatarColor,
        avatarUrl: user?.avatarUrl || "",
        isVerified: user?.isVerified || false,
        isAdmin: user?.isAdmin || false,
    };
}

// ── State ──────────────────────────────────────────────────────
router.get("/me", verifyToken, async (req, res) => {
    try {
        const user = await User.findById(req.userId).lean();
        const lu = await ensureUser(req);
        regenHearts(lu);
        await finalizeStaleLeague(lu);
        await resetDailyIfNeeded(lu);
        await ensureLeague(lu);
        await lu.save();
        res.json(buildMe(lu, user));
    } catch (err) {
        console.error("[LEARN] /me error:", err.message);
        res.status(500).json({ error: "Failed to load learning state" });
    }
});

router.get("/languages", verifyToken, async (req, res) => {
    try {
        const lu = await ensureUser(req);
        await resetDailyIfNeeded(lu);
        const user = await User.findById(req.userId).lean();
        const catalog = LANGUAGE_CATALOG.map((lang) => {
            const prog = lu.courseProgress?.get?.(lang.id) || {};
            return {
                ...lang,
                available: !!COURSES[lang.id],
                crowns: prog.crowns || 0,
                xp: prog.xp || 0,
                lessonsDone: (prog.lessonsDone || []).length,
                active: lu.currentCourse === lang.id,
            };
        });
        res.json({ me: buildMe(lu, user), languages: catalog });
    } catch (err) {
        console.error("[LEARN] languages error:", err.message);
        res.status(500).json({ error: "Failed to load languages" });
    }
});

// ── Course / lesson content ────────────────────────────────────
router.get("/course/:courseId", verifyToken, async (req, res) => {
    try {
        const { courseId } = req.params;
        const meta = catalogById[courseId];
        const course = COURSES[courseId];
        if (!meta || !course) return res.status(404).json({ error: "Course not found" });

        const lu = await ensureUser(req);
        await resetDailyIfNeeded(lu);
        const user = await User.findById(req.userId).lean();
        const prog = lu.courseProgress?.get?.(courseId) || { crowns: 0, xp: 0, lessonsDone: [], lessonCrowns: {} };
        const done = new Set(prog.lessonsDone || []);
        const lessonCrowns = prog.lessonCrowns || {};

        const chapters = course.chapters.map((chapter, ci) => ({
            id: chapter.id,
            chapter: chapter.chapter,
            title: chapter.title,
            theme: chapter.theme,
            tier: chapter.tier,
            difficulty: chapter.difficulty,
            color: chapter.color,
            steps: chapter.steps.map((step, si) => ({
                id: step.id,
                title: step.title,
                lessons: step.lessons.map((lesson, li) => ({
                    id: lesson.id,
                    title: lesson.title,
                    type: lesson.type,
                    xp: lesson.xp,
                    done: done.has(lesson.id),
                    crown: done.has(lesson.id),
                    crowns: done.has(lesson.id) ? Math.max(1, lessonCrowns[lesson.id] || 1) : 0,
                    locked: ci === 0 && si === 0 && li === 0 ? false : !done.has(prevLessonId(course, ci, si, li)),
                    index: li,
                })),
            })),
        }));

        const progress = {
            lessonsDone: done.size,
            totalLessons: course.chapters.reduce((n, c) => n + c.steps.reduce((m, s) => m + s.lessons.length, 0), 0),
            chaptersDone: course.chapters.filter((c) => c.steps.every((s) => s.lessons.every((l) => done.has(l.id)))).length,
        };

        res.json({
            me: buildMe(lu, user),
            course: { id: courseId, meta, chapters, progress },
        });
    } catch (err) {
        console.error("[LEARN] course error:", err.message);
        res.status(500).json({ error: "Failed to load course" });
    }
});

function prevLessonId(course, ci, si, li) {
    const chapters = course.chapters;
    if (li > 0) return chapters[ci]?.steps[si]?.lessons[li - 1]?.id;
    if (si > 0) {
        const prev = chapters[ci]?.steps?.[si - 1]?.lessons;
        if (prev?.length) return prev[prev.length - 1].id;
    }
    for (let i = ci - 1; i >= 0; i--) {
        const steps = chapters[i].steps;
        if (steps.length) {
            const lessons = steps[steps.length - 1].lessons;
            if (lessons.length) return lessons[lessons.length - 1].id;
        }
    }
    return null;
}

router.get("/lesson/:courseId/:lessonId", verifyToken, async (req, res) => {
    try {
        const { courseId, lessonId } = req.params;
        const meta = catalogById[courseId];
        const course = COURSES[courseId];
        if (!meta || !course) return res.status(404).json({ error: "Course not found" });

        let found = null;
        for (const chapter of course.chapters) {
            for (const step of chapter.steps) {
                for (const lesson of step.lessons) {
                    if (lesson.id === lessonId) found = lesson;
                }
            }
        }
        if (!found) return res.status(404).json({ error: "Lesson not found" });

        const lu = await ensureUser(req);
        await resetDailyIfNeeded(lu);
        const user = await User.findById(req.userId).lean();
        const stage = found.difficulty || 1;
        const questions = buildQuestions(courseId, meta, course, found, stage);
        res.json({
            me: buildMe(lu, user),
            lesson: {
                id: found.id,
                title: found.title,
                type: found.type,
                difficulty: stage,
                xp: found.xp,
                langName: meta.name,
                flag: meta.flag,
                hl: meta.hl,
                rtl: meta.rtl,
            },
            questions,
        });
    } catch (err) {
        console.error("[LEARN] lesson error:", err.message);
        res.status(500).json({ error: "Failed to load lesson" });
    }
});

// ── Lesson completion (heart of the XP/streak/gem/league engine) ──
router.post("/lesson/complete", verifyToken, async (req, res) => {
    try {
        const { courseId, lessonId, correct, total, perfect, practice } = req.body;
        const course = COURSES[courseId];
        const meta = catalogById[courseId];
        if (!meta || !course) return res.status(400).json({ error: "Course not found" });

        let lessonMeta = null;
        for (const chapter of course.chapters) {
            for (const step of chapter.steps) {
                for (const lesson of step.lessons) if (lesson.id === lessonId) lessonMeta = lesson;
            }
        }
        if (!lessonMeta && !practice) return res.status(400).json({ error: "Lesson not found" });

        const user = await User.findById(req.userId).lean();
        let lu = await ensureUser(req);
        regenHearts(lu);
        await finalizeStaleLeague(lu);
        await resetDailyIfNeeded(lu);

        const wrong = Math.max(0, (total || 0) - Math.max(0, correct || 0));
        const isPerfect = !!perfect || wrong === 0;

        // XP: base from lesson (10), perfect +5. Practice: 5 XP (first of day 20).
        let xpEarned = 0;
        if (practice) {
            xpEarned = lu.dailyXp > 0 ? 5 : 20;
        } else {
            xpEarned = (lessonMeta.xp || 10) + (isPerfect ? 5 : 0);
        }

        // Hearts
        lu.hearts = Math.max(0, (lu.hearts || 5) - wrong);
        if (lu.hearts === 0) lu.hearts = 1; // completing a lesson returns a heart

        // Streak
        applyStreak(lu);

        // XP / counters
        lu.xp += xpEarned;
        lu.dailyXp += xpEarned;
        lu.totalAnswered += Math.max(0, total || 0);
        lu.totalCorrect += Math.max(0, correct || 0);
        if (!practice) {
            lu.lessonsCompleted += 1;
            if (isPerfect) lu.perfectLessons += 1;
            const prog = lu.courseProgress.get(courseId) || { crowns: 0, xp: 0, lessonsDone: [], lessonCrowns: {} };
            if (!prog.lessonsDone.includes(lessonId)) prog.lessonsDone.push(lessonId);
            prog.lessonCrowns = prog.lessonCrowns || {};
            prog.lessonCrowns[lessonId] = Math.min(5, (prog.lessonCrowns[lessonId] || 0) + 1);
            if (isPerfect) prog.crowns = Math.min(5, prog.crowns + 1);
            if ((prog.lessonCrowns[lessonId] || 0) === 5) lu.gems += 30; // 5th crown: bonus gems
            prog.xp += xpEarned;
            lu.courseProgress.set(courseId, prog);
        }
        lu.gems += practice ? 4 : 3;

        // Quests
        questDeltas(lu, { lessons: practice ? 0 : 1, xp: xpEarned, perfect: isPerfect && !practice ? 1 : 0, correct });
        markQuestDone(lu);

        // League XP
        await addLeagueXp(lu, xpEarned);

        // Comeback rewards: if I came back after someone asked me, reward the asker.
        await payoutComebackRewards(lu, user);

        // New achievements
        const fresh = checkAchievements(lu, true);

        await lu.save();
        res.json({
            me: buildMe(lu, user),
            rewards: {
                xp: xpEarned,
                gems: practice ? 4 : 3,
                perfect: isPerfect,
                practice: !!practice,
            },
            newAchievements: fresh.map((id) => ACHIEVEMENTS.find((a) => a.id === id)),
        });
    } catch (err) {
        console.error("[LEARN] complete error:", err.message);
        res.status(500).json({ error: "Failed to complete lesson" });
    }
});

async function payoutComebackRewards(lu, user) {
    try {
        const notifs = await Notification.find({
            recipient: lu.username,
            type: "comeback",
            read: false,
        }).lean();
        if (!notifs.length) return;
        const askers = [...new Set(notifs.map((n) => n.fromUser))];
        const askersLearners = await LearnUser.find({ username: { $in: askers } });
        for (const asker of askersLearners) {
            asker.gems += COMEBACK_BONUS_GEMS;
            asker.xp += 10;
            await asker.save();
            await Notification.create({
                recipient: asker.username,
                type: "comeback_reward",
                fromUser: lu.username,
                fromColor: user?.avatarColor || "#3b82f6",
                fromAvatarUrl: user?.avatarUrl || "",
                text: `${lu.username} came back! You earned +10 XP and +50 💎.`,
            });
        }
        await Notification.updateMany({ recipient: lu.username, type: "comeback", read: false }, { read: true });
    } catch (err) {
        console.error("[LEARN] comeback reward error:", err.message);
    }
}

// ── Hearts ─────────────────────────────────────────────────────
router.post("/hearts/refill", verifyToken, async (req, res) => {
    try {
        const user = await User.findById(req.userId).lean();
        let lu = await ensureUser(req);
        regenHearts(lu);
        if (lu.hearts >= 5) return res.json({ me: buildMe(lu, user), error: "Hearts already full" });
        if (lu.gems < HEARTS_REFILL_COST) return res.status(400).json({ error: "Not enough diamonds" });
        lu.gems -= HEARTS_REFILL_COST;
        lu.hearts = 5;
        lu.heartsUpdatedAt = new Date();
        await lu.save();
        res.json({ me: buildMe(lu, user), ok: true });
    } catch (err) {
        console.error("[LEARN] hearts refill error:", err.message);
        res.status(500).json({ error: "Failed to refill hearts" });
    }
});

// ── Shop / spend diamonds ─────────────────────────────────────
router.post("/shop/buy", verifyToken, async (req, res) => {
    try {
        const { item, friend } = req.body;
        const user = await User.findById(req.userId).lean();
        let lu = await ensureUser(req);

        const respond = async () => ({ me: buildMe(lu, user), ok: true });

        if (item === "streak_freeze") {
            if (lu.gems < STREAK_FREEZE_COST) return res.status(400).json({ error: "Not enough diamonds" });
            lu.gems -= STREAK_FREEZE_COST;
            lu.streakFreezes = Math.min(2, (lu.streakFreezes || 0) + 1);
            await lu.save();
            return res.json(await respond());
        }

        if (item === "streak_repair") {
            if (!lu.streakBrokenAt) return res.status(400).json({ error: "Your streak is not broken" });
            const brokenDay = todayKey(new Date(lu.streakBrokenAt));
            if (daysBetween(brokenDay, todayKey()) > 3) {
                lu.streakBrokenAt = null;
                await lu.save();
                return res.status(400).json({ error: "Streak repair window has passed" });
            }
            if (lu.gems < STREAK_REPAIR_COST) return res.status(400).json({ error: "Not enough diamonds" });
            lu.gems -= STREAK_REPAIR_COST;
            lu.streak += 1;
            if (lu.streak > lu.longestStreak) lu.longestStreak = lu.streak;
            lu.streakBrokenAt = null;
            await lu.save();
            return res.json(await respond());
        }

        if (item === "tip_friend") {
            if (!friend) return res.status(400).json({ error: "Choose a friend" });
            if (friend === lu.username) return res.status(400).json({ error: "You cannot tip yourself" });
            if (lu.gems < TIP_FRIEND_COST) return res.status(400).json({ error: "Not enough diamonds" });
            const friendUser = await User.findOne({ username: friend }).lean();
            if (!friendUser) return res.status(400).json({ error: "Friend not found" });
            let friendLu = await LearnUser.findOne({ userId: friendUser._id });
            if (!friendLu) {
                friendLu = await LearnUser.create({ userId: friendUser._id, username: friendUser.username || friend, dailyDate: "", quests: [] });
            }
            lu.gems -= TIP_FRIEND_COST;
            friendLu.gems = Math.min(friendLu.gems + COMEBACK_BONUS_GEMS, 5000);
            await Promise.all([lu.save(), friendLu.save()]);
            await Notification.create({
                recipient: friend,
                type: "learn_gift",
                fromUser: lu.username,
                fromColor: user?.avatarColor || "#3b82f6",
                fromAvatarUrl: user?.avatarUrl || "",
                text: `${lu.username} sent you a diamond tip (+${COMEBACK_BONUS_GEMS} 💎). Come back and keep your streak alive!`,
            });
            return res.json(await respond());
        }

        if (item === "comeback") {
            if (!friend) return res.status(400).json({ error: "Choose a friend" });
            if (friend === lu.username) return res.status(400).json({ error: "You cannot ask yourself" });
            if ((lu.comebackSent || []).includes(friend)) return res.status(400).json({ error: "You already asked this friend" });
            const friendUser = await User.findOne({ username: friend }).lean();
            if (!friendUser) return res.status(400).json({ error: "Friend not found" });
            if ((lu.comebackSent || []).length >= 5) return res.status(400).json({ error: "Comeback limit reached for today" });
            lu.comebackSent.push(friend);
            await lu.save();
            await Notification.create({
                recipient: friend,
                type: "comeback",
                fromUser: lu.username,
                fromColor: user?.avatarColor || "#3b82f6",
                fromAvatarUrl: user?.avatarUrl || "",
                text: `${lu.username} asked you to come back! Complete a lesson and you both earn bonuses. 🔥`,
            });
            return res.json(await respond());
        }

        return res.status(400).json({ error: "Unknown item" });
    } catch (err) {
        console.error("[LEARN] shop error:", err.message);
        res.status(500).json({ error: "Failed to complete purchase" });
    }
});

// ── Quests ────────────────────────────────────────────────────
router.post("/quests/claim", verifyToken, async (req, res) => {
    try {
        const { questId } = req.body;
        const user = await User.findById(req.userId).lean();
        let lu = await ensureUser(req);
        await resetDailyIfNeeded(lu);
        const q = (lu.quests || []).find((x) => x.id === questId);
        if (!q) return res.status(404).json({ error: "Quest not found" });
        if (!q.done) return res.status(400).json({ error: "Quest not finished yet" });
        if (q.claimed) return res.json({ me: buildMe(lu, user), gems: 0, message: "Already claimed" });
        q.claimed = true;
        lu.gems += 10;
        await lu.save();
        const allClaimed = lu.quests.every((x) => x.claimed || !x.done);
        res.json({ me: buildMe(lu, user), gems: 10, allClaimed });
    } catch (err) {
        console.error("[LEARN] quests claim error:", err.message);
        res.status(500).json({ error: "Failed to claim quest" });
    }
});

// ── League ─────────────────────────────────────────────────────
router.get("/league", verifyToken, async (req, res) => {
    try {
        const user = await User.findById(req.userId).lean();
        let lu = await ensureUser(req);
        await finalizeStaleLeague(lu);
        await ensureLeague(lu);
        await lu.save();

        let standings = [];
        let leagueInfo = null;
        let myRank = -1;
        if (lu.league && lu.league.leagueId) {
            const doc = await LearnLeague.findById(lu.league.leagueId).lean();
            if (doc) {
                standings = [...doc.members].sort((a, b) => b.xp - a.xp);
                myRank = standings.findIndex((m) => String(m.userId) === String(lu.userId)) + 1;
                leagueInfo = { tier: doc.tier, tierName: LEAGUE_TIERS[doc.tier] };
            }
        }

        const now = new Date();
        const monday = nextMonday(now);
        const endMs = Math.max(0, monday.getTime() - now.getTime());

        res.json({
            me: buildMe(lu, user),
            league: {
                tier: lu.league?.tier ?? 0,
                tierName: LEAGUE_TIERS[lu.league?.tier ?? 0],
                myRank,
                xp: lu.league?.xp || 0,
                standings: standings.map((m, i) => ({
                    rank: i + 1,
                    username: m.username,
                    xp: m.xp,
                    avatarColor: m.avatarColor,
                    avatarUrl: m.avatarUrl,
                    you: String(m.userId) === String(lu.userId),
                })),
                remainingMs: endMs,
                lastSeason: lu.lastSeason,
            },
        });
    } catch (err) {
        console.error("[LEARN] league error:", err.message);
        res.status(500).json({ error: "Failed to load league" });
    }
});

// ── Global leaderboard ────────────────────────────────────────
router.get("/leaderboard", verifyToken, async (req, res) => {
    try {
        const user = await User.findById(req.userId).lean();
        let lu = await ensureUser(req);

        const top = await LearnUser.find().select("username xp gems streak totalCorrect achievements league lastSeason")
            .sort({ xp: -1 }).limit(50).lean();
        const usernames = top.map((t) => t.username);
        const users = await User.find({ username: { $in: usernames } })
            .select("username avatarColor avatarUrl isVerified isAdmin").lean();
        const umap = Object.fromEntries(users.map((u) => [u.username, u]));

        const rows = top.map((t, i) => ({
            rank: i + 1,
            username: t.username,
            xp: t.xp,
            gems: t.gems,
            streak: t.streak,
            totalCorrect: t.totalCorrect,
            avatarColor: umap[t.username]?.avatarColor || "#3b82f6",
            avatarUrl: umap[t.username]?.avatarUrl || "",
            isVerified: umap[t.username]?.isVerified || false,
            isAdmin: umap[t.username]?.isAdmin || false,
            you: t.username === lu.username,
        }));

        const myPos = rows.find((r) => r.you)?.rank || -1;

        res.json({
            me: buildMe(lu, user),
            leaderboard: rows,
            myRank: myPos,
        });
    } catch (err) {
        console.error("[LEARN] leaderboard error:", err.message);
        res.status(500).json({ error: "Failed to load leaderboard" });
    }
});

// ── Friends / competition ─────────────────────────────────────
router.get("/friends", verifyToken, async (req, res) => {
    try {
        const user = await User.findById(req.userId).lean();
        let lu = await ensureUser(req);
        const followList = user?.following || [];
        const friendUsers = await User.find({ username: { $in: followList } })
            .select("username avatarColor avatarUrl isVerified").lean();
        const fLearners = await LearnUser.find({ username: { $in: followList } }).lean();
        const lmap = Object.fromEntries(fLearners.map((l) => [l.username, l]));
        const umap = Object.fromEntries(friendUsers.map((u) => [u.username, u]));

        const friends = followList.filter((u) => umap[u]).map((u) => {
            const l = lmap[u] || {};
            return {
                username: u,
                avatarColor: umap[u].avatarColor || "#3b82f6",
                avatarUrl: umap[u].avatarUrl || "",
                isVerified: umap[u].isVerified || false,
                xp: l.xp || 0,
                streak: l.streak || 0,
                gems: l.gems || 0,
                currentCourse: l.currentCourse || "",
                lessonsCompleted: l.lessonsCompleted || 0,
                playing: !!l.userId,
                longestStreak: l.longestStreak || 0,
            };
        });

        res.json({
            me: buildMe(lu, user),
            friends: friends.sort((a, b) => b.xp - a.xp),
        });
    } catch (err) {
        console.error("[LEARN] friends error:", err.message);
        res.status(500).json({ error: "Failed to load friends" });
    }
});

// ── Start / switch a course ───────────────────────────────────
router.post("/start", verifyToken, async (req, res) => {
    try {
        const { courseId } = req.body;
        if (!COURSES[courseId]) return res.status(404).json({ error: "Course not found" });
        const user = await User.findById(req.userId).lean();
        let lu = await ensureUser(req);
        lu.currentCourse = courseId;
        if (!lu.courseProgress.has(courseId)) {
            lu.courseProgress.set(courseId, { crowns: 0, xp: 0, lessonsDone: [] });
        }
        await lu.save();
        res.json({ me: buildMe(lu, user) });
    } catch (err) {
        console.error("[LEARN] start error:", err.message);
        res.status(500).json({ error: "Failed to start course" });
    }
});

// ── Daily goal ────────────────────────────────────────────────
router.post("/goal", verifyToken, async (req, res) => {
    try {
        const { goal } = req.body;
        const allowed = [10, 20, 30, 40, 50];
        if (!allowed.includes(Number(goal))) return res.status(400).json({ error: "Invalid goal" });
        const user = await User.findById(req.userId).lean();
        let lu = await ensureUser(req);
        lu.dailyGoal = Number(goal);
        await lu.save();
        res.json({ me: buildMe(lu, user) });
    } catch (err) {
        console.error("[LEARN] goal error:", err.message);
        res.status(500).json({ error: "Failed to update goal" });
    }
});

module.exports = router;