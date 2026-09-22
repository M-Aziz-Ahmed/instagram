// ─────────────────────────────────────────────────────────────
// Education sub-app shared helpers: deterministic question
// generation, league tiers, streaks, levels, quests, badges.
// ─────────────────────────────────────────────────────────────

const LEAGUE_TIERS = ["Bronze", "Silver", "Gold", "Sapphire", "Ruby", "Emerald", "Amethyst", "Pearl", "Obsidian", "Diamond"];
const LEAGUE_SIZE = 15;
const PROMOTE_N = 3;
const RELEGATE_N = 3;
const MAX_HEARTS = 5;
const HEARTS_REFILL_COST = 150;
const STREAK_FREEZE_COST = 200;
const STREAK_REPAIR_COST = 50;
const TIP_FRIEND_COST = 100;
const COMEBACK_BONUS_GEMS = 50;

function pad(n) { return String(n).padStart(2, "0"); }

// Local-timezone day key YYYY-MM-DD.
function todayKey(d = new Date()) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Week season key: the Monday of the current week (weeks run Mon–Sun like Duolingo).
function seasonKey(d = new Date()) {
    const day = new Date(d);
    const dow = (day.getDay() + 6) % 7; // Monday = 0
    day.setDate(day.getDate() - dow);
    return todayKey(day);
}

function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function hashCode(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
        h = ((h << 5) - h + str.charCodeAt(i)) | 0;
    }
    return Math.abs(h);
}

function shuffle(rng, arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function sample(rng, arr, n) {
    return shuffle(rng, arr).slice(0, n);
}

// Duolingo-style level from cumulative XP.
function levelFromXp(xp) {
    let level = 1;
    let need = 0;
    let base = 30;
    let remaining = xp;
    while (remaining >= need + base) {
        remaining -= need + base;
        level++;
        need = base * 0.5;
        base = Math.round(base * 1.22 + 4);
    }
    return level;
}

function levelProgress(xp) {
    let level = 1;
    let need = 0;
    let base = 30;
    let remaining = xp;
    while (remaining >= need + base) {
        remaining -= need + base;
        level++;
        need = base * 0.5;
        base = Math.round(base * 1.22 + 4);
    }
    const curr = need + base;
    return { level, current: remaining, needed: curr, pct: Math.max(0, Math.min(1, remaining / curr)) };
}

// Heart recharge: 1 heart every 30 minutes up to max.
function regenHearts(lu) {
    const now = Date.now();
    const rateMs = 30 * 60 * 1000;
    const elapsed = now - new Date(lu.heartsUpdatedAt || now).getTime();
    if (elapsed > 0 && lu.hearts < MAX_HEARTS) {
        const gained = Math.floor(elapsed / rateMs);
        if (gained > 0) {
            lu.hearts = Math.min(MAX_HEARTS, lu.hearts + gained);
            lu.heartsUpdatedAt = new Date(now - (elapsed % rateMs));
        }
    }
    return lu;
}

// Flatten all vocab+phrases across a course (chapters → steps → lessons,
// or legacy units) to build distractor pools.
function collectCourseItems(course) {
    const vocab = [];
    const phrases = [];
    const sections = course.chapters || course.units || [];
    for (const chapter of sections) {
        const lessons = chapter.steps ? chapter.steps.flatMap((s) => s.lessons) : chapter.lessons;
        for (const lesson of lessons) {
            vocab.push(...(lesson.vocab || []));
            phrases.push(...(lesson.phrases || []));
        }
    }
    return { vocab, phrases };
}

const uniqTargets = (items) => [...new Map(items.map((v) => [v.t, v])).values()];
const uniqEnglish = (items) => [...new Map(items.map((v) => [v.e, v])).values()];

function pickDistractors(rng, correct, list, take, key) {
    const others = list.filter((x) => x[key] !== correct[key]);
    const picked = sample(rng, others, take).map((x) => ({ value: x[key], emoji: x.emoji || "", gloss: x.gloss || "" }));
    const result = shuffle(rng, [{ value: correct[key], emoji: correct.emoji || "", gloss: correct.gloss || "" }, ...picked]);
    return {
        options: result.map((o) => o.value),
        emojis: result.map((o) => o.emoji),
        glosses: result.map((o) => o.gloss),
        correctIndex: result.findIndex((o) => o.value === correct[key]),
    };
}

// Build the exercise question set for a lesson (deterministic per seed).
// Route: story/pronounce lessons get their own generators; practice lessons
// get the Duolingo-style drills. `stage` is the lesson difficulty (1-10) —
// speaking exercises are available from difficulty 1, and whole sentences
// are pronounced in "Speak up" steps from difficulty 6.
function buildQuestions(langId, langMeta, course, lesson, stage = 1) {
    // Subject courses (maths, tests, MCQ banks…) author their own question
    // set per lesson — no generation, fully hand-curated order.
    if (Array.isArray(lesson.questions) && lesson.questions.length) {
        return lesson.questions;
    }
    if (lesson.type === "story") return buildStoryQuestions(langId, langMeta, course, lesson);
    if (lesson.type === "pronounce") return buildPronounceQuestions(langId, langMeta, lesson, stage);
    return buildPracticeQuestions(langId, langMeta, course, lesson, stage);
}

function buildPracticeQuestions(langId, langMeta, course, lesson, stage = 1) {
    const rng = mulberry32(hashCode(`${langId}:${lesson.id}`));
    const spaced = langMeta.spaced !== false;
    const all = collectCourseItems(course);
    const localVocab = lesson.vocab || [];
    const localPhrases = lesson.phrases || [];
    const pool = localVocab.length >= 6 ? localVocab : all.vocab;

    const questions = [];
    let qi = 0;

    // 0) "First, let's learn" — a non-graded flashcard pass over the lesson's
    //    own words (or phrases) that opens beginner lessons (difficulty ≤ 2).
    //    A zero-knowledge learner meets each word with emoji, audio and meaning
    //    BEFORE any question presupposes it — no more "you're expected to know
    //    请 on day one".
    if (stage <= 2) {
        const teachSrc = localVocab.length ? localVocab : localPhrases.length ? localPhrases : all.vocab;
        const teachItems = uniqEnglish(teachSrc).slice(0, 6).map((w) => ({
            e: w.e, t: w.t, emoji: w.emoji || "", gloss: w.gloss || "",
        }));
        if (teachItems.length) {
            questions.push({
                id: "learn",
                type: "learn",
                prompt: "First, let's learn these before the questions",
                items: teachItems,
            });
        }
    }

    // 1) select: Which of these means "<english>" → target options.
    //    For scripts without word spaces (CJK/Thai) we lead with extra easy
    //    selects instead of wordbank, so beginners never type raw characters.
    const fwdCount = spaced ? 3 : 5;
    const s1 = sample(rng, pool, fwdCount);
    for (const item of s1) {
        const { options, emojis, glosses, correctIndex } = pickDistractors(rng, item, uniqTargets(pool), 3, "t");
        questions.push({
            id: `q${qi++}`,
            type: "select",
            prompt: `Which of these means “${item.e}”?`,
            options, emojis, glosses, correctIndex,
            item: { e: item.e, t: item.t, emoji: item.emoji || "", gloss: item.gloss || "" },
        });
    }

    // 2) select reverse: What does "<target>" mean → english options
    const s2src = localPhrases.length ? localPhrases : localVocab.length ? localVocab : all.vocab;
    const s2 = sample(rng, s2src, 2);
    for (const item of s2) {
        const { options, emojis, glosses, correctIndex } = pickDistractors(rng, item, uniqEnglish(pool), 3, "e");
        questions.push({
            id: `q${qi++}`,
            type: "select",
            prompt: `What does “${item.t}” mean?`,
            options, emojis, glosses, correctIndex,
            item: { e: item.e, t: item.t, emoji: item.emoji || "", gloss: item.gloss || "" },
        });
    }

    // 3) wordbank: build "<english>" in target language from chips
    if (spaced) {
        const wpSrc = localPhrases.length ? localPhrases : all.phrases;
        const wp = sample(rng, wpSrc, 2);
        for (let i = 0; i < 2 && wp[i]; i++) {
            const phrase = wp[i];
            const tokens = phrase.t.split(" ").filter(Boolean);
            let bank = tokens.slice();
            const others = pool.filter((v) => v.t !== phrase.t && v.t.split(" ").length === 1).slice(0, 4);
            const distractor = sample(rng, others, Math.max(0, Math.min(2, 8 - tokens.length))).map((x) => x.t);
            bank = shuffle(rng, [...bank, ...distractor]);
            questions.push({
                id: `q${qi++}`,
                type: "wordbank",
                prompt: `Write this in ${langMeta.name}: “${phrase.e}”`,
                tokens,
                bank: bank.length ? bank : tokens,
                phrase,
            });
        }

        // 4) wordbank reverse: write "<target>" in English
        const wp2 = sample(rng, wpSrc, 2);
        for (let i = 0; i < 2 && wp2[i]; i++) {
            const phrase = wp2[i];
            const tokens = phrase.e.split(" ").filter(Boolean);
            let bank = tokens.slice();
            const others = pool.filter((v) => v.e !== phrase.e && v.e.split(" ").length === 1).slice(0, 6);
            const distractor = sample(rng, others, Math.max(0, Math.min(2, 8 - tokens.length))).map((x) => x.e);
            bank = shuffle(rng, [...bank, ...distractor]);
            questions.push({
                id: `q${qi++}`,
                type: "wordbank",
                prompt: `Write this in English: “${phrase.t}”`,
                tokens,
                bank: bank.length ? bank : tokens,
                phrase,
                reverse: true,
            });
        }
    }

    // 5) match: pair up translations
    const matchPool = localVocab.length ? localVocab : all.vocab;
    const pairCount = Math.min(6, Math.max(3, Math.floor(matchPool.length / 2)));
    const pairs = sample(rng, matchPool, pairCount);
    questions.push({
        id: `q${qi++}`,
        type: "match",
        prompt: "Match the pairs",
        pairs: pairs.map((v) => ({ e: v.e, t: v.t, gloss: v.gloss || "" })),
    });

    // 6) listen: speak target, choose English meaning
    const lsSrc = localPhrases.length ? localPhrases : localVocab.length ? localVocab : all.vocab;
    const ls = sample(rng, lsSrc, 1)[0] || sample(rng, all.vocab, 1)[0];
    const { options, emojis, glosses, correctIndex } = pickDistractors(rng, ls, uniqEnglish(pool), 3, "e");
    questions.push({
        id: `q${qi++}`,
        type: "listen",
        prompt: "What does the audio say?",
        speak: ls.t,
        options, emojis, glosses, correctIndex,
        item: { e: ls.e, t: ls.t, gloss: ls.gloss || "" },
    });

    // 7) speak: "Say this in <lang>" — a speech-to-text exercise. Present from
    //    difficulty 1 on (pronunciation from the very first chapter); deeper
    //    steps add a second sentence. The client falls back to a speaker +
    //    self-check when speech recognition is unavailable.
    const speakSrc = localPhrases.length ? localPhrases : localVocab.length ? localVocab : all.vocab;
    const s3 = sample(rng, uniqEnglish(speakSrc), Math.min(stage >= 5 ? 2 : 1, new Set(speakSrc.map((i) => i.e)).size));
    for (const item of s3) {
        questions.push({
            id: `q${qi++}`,
            type: "speak",
            prompt: `Say this in ${langMeta.name}`,
            say: item.e,
            expect: item.t,
            gloss: item.gloss || "",
            emoji: item.emoji || "",
        });
    }

    return questions;
}

// ── "Story time" — the 5th lesson of even steps ──────────────
// The learner listens to a 1-3 sentence micro-story built from the chapter's
// translated phrases, then answers comprehension questions. English is the
// comprehension language; the target-language audio does the teaching.
function buildStoryQuestions(langId, langMeta, course, lesson) {
    const rng = mulberry32(hashCode(`${langId}:${lesson.id}:story`));
    const all = collectCourseItems(course);
    const phrases = uniqEnglish(lesson.phrases || []);
    const vocab = uniqEnglish(lesson.vocab || []);
    const allPhrases = uniqEnglish(all.phrases);
    const allWords = uniqEnglish(all.vocab);

    const nSentences = Math.min(3, Math.max(1, phrases.length || 0));
    const sentences = sample(rng, phrases, nSentences).map((p) => ({ e: p.e, t: p.t, gloss: p.gloss || "" }));
    const wordsShown = sample(rng, vocab.length ? vocab : allWords, 3).map((w) => ({
        e: w.e, t: w.t, emoji: w.emoji || "", gloss: w.gloss || "",
    }));

    const questions = [
        {
            id: "q0",
            type: "story",
            story: {
                title: (lesson.title || "").replace(/· Story time/i, "").trim() || lesson.title,
                lang: langMeta.hl,
                sentences,
                words: wordsShown,
            },
            prompt: "Listen to the short story, then answer the questions that follow.",
        },
    ];

    // q1: Which sentence did you hear? (target-language options)
    const q1 = sentences[0] || (wordsShown[0] && { e: wordsShown[0].e, t: wordsShown[0].t, gloss: wordsShown[0].gloss });
    if (q1 && q1.t) {
        const q1pool = uniqTargets([...(allPhrases.map((p) => ({ e: p.e, t: p.t, gloss: p.gloss }))), ...sentences]);
        const { options, emojis, glosses, correctIndex } = pickDistractors(rng, q1, q1pool, 3, "t");
        questions.push({
            id: "q1",
            type: "select",
            prompt: "Which of these sentences did you hear?",
            options, emojis, glosses, correctIndex,
            item: { e: q1.e, t: q1.t, gloss: q1.gloss || "" },
        });
    }

    // q2: True/false comprehension — the statement is a real story sentence
    //     when the "True" option happens to come first, else a distractor.
    if (sentences.length) {
        const tfOpts = shuffle(rng, ["True", "False"]);
        const statementIsTrue = tfOpts[0] === "True";
        const stmt = statementIsTrue
            ? sentences[Math.floor(rng() * sentences.length)]
            : (sample(rng, allPhrases.filter((p) => !sentences.some((s) => s.e === p.e)), 1)[0] || { e: "", t: "" });
        if (stmt.t) {
            questions.push({
                id: "q2",
                type: "truefalse",
                prompt: "Did the story say this?",
                statement: stmt.e,
                speak: statementIsTrue ? stmt.t : "",
                options: tfOpts,
                correctIndex: tfOpts.indexOf(statementIsTrue ? "True" : "False"),
            });
        }
    }

    // q3: What does a story word mean? (English options)
    const word = wordsShown[0];
    if (word && word.t) {
        const src = vocab.length ? vocab : allWords;
        const { options, emojis, glosses, correctIndex } = pickDistractors(rng, word, src, 3, "e");
        questions.push({
            id: "q3",
            type: "select",
            prompt: `What does “${word.t}” mean?`,
            options, emojis, glosses, correctIndex,
            item: { e: word.e, t: word.t, emoji: word.emoji || "", gloss: word.gloss || "" },
        });
    }

    return questions;
}

// ── "Speak up" — the 5th lesson of odd steps ──────────────────
// Pronounce the chapter's words (and, from difficulty 6, whole sentences).
// The client records, recognizes (native desktop or Web Speech API) and
// grades each item against the expected target-language text.
function buildPronounceQuestions(langId, langMeta, lesson, difficulty = 1) {
    const rng = mulberry32(hashCode(`${langId}:${lesson.id}:speak`));
    const words = uniqEnglish(lesson.vocab || []);
    const phrases = uniqEnglish(lesson.phrases || []);

    const items = [];
    const wordCount = Math.min(3, Math.max(1, words.length));
    items.push(...sample(rng, words, wordCount));
    if (difficulty >= 6) {
        const pCount = Math.min(2, phrases.length);
        items.push(...sample(rng, phrases, pCount));
    }

    return [{
        id: "q0",
        type: "pronounce",
        prompt: `Pronounce ${items.length === 1 ? "this" : "these"} in ${langMeta.name}.`,
        items: items.map((w) => ({ e: w.e, t: w.t, emoji: w.emoji || "", gloss: w.gloss || "" })),
        rtl: langMeta.rtl,
        hl: langMeta.hl,
    }];
}

// ── Daily Quests ───────────────────────────────────────────────
const QUEST_TEMPLATES = [
    { id: "lessons", desc: "Complete {n} lessons", goal: 3, target: "lessons" },
    { id: "xp", desc: "Earn {n} XP today", goal: 20, target: "xp" },
    { id: "perfect", desc: "Get {n} perfect lesson", goal: 1, target: "perfect" },
    { id: "correct", desc: "Answer {n} questions correctly", goal: 15, target: "correct" },
    { id: "words", desc: "Learn {n} new words", goal: 10, target: "correct" },
];

function buildDailyQuests(seed) {
    const rng = mulberry32(hashCode(`quests:${seed}`));
    return sample(rng, QUEST_TEMPLATES, 3).map((t) => ({
        id: t.id,
        desc: t.desc,
        goal: t.goal,
        target: t.target,
        progress: 0,
        done: false,
    }));
}

// ── Achievements ───────────────────────────────────────────────
function checkAchievements(lu, newly = false) {
    const unlocked = [];
    const add = (id) => {
        if (!lu.achievements.includes(id)) {
            lu.achievements.push(id);
            if (newly) unlocked.push(id);
        }
    };
    if (lu.lessonsCompleted >= 1) add("first_lesson");
    if (lu.streak >= 3) add("streak_3");
    if (lu.streak >= 7) add("streak_7");
    if (lu.streak >= 30) add("streak_30");
    if (lu.streak >= 100) add("streak_100");
    if (lu.perfectLessons >= 5) add("perfect_5");
    if (lu.perfectLessons >= 20) add("perfect_20");
    if (lu.xp >= 500) add("xp_500");
    if (lu.xp >= 2000) add("xp_2000");
    if (lu.xp >= 10000) add("xp_10000");
    if (lu.league && lu.league.season) add("league_join");
    if (lu.lastSeason && lu.lastSeason.rank <= 3) add("league_promo");
    if (lu.gems >= 500) add("gems_500");
    if (lu.gems >= 2000) add("gems_2000");
    if (lu.totalCorrect >= 100) add("words_100");
    return unlocked;
}

const ACHIEVEMENTS = [
    { id: "first_lesson", title: "First Steps", desc: "Complete your first lesson", icon: "🌱" },
    { id: "streak_3", title: "Warming Up", desc: "3-day streak", icon: "🔥" },
    { id: "streak_7", title: "On a Roll", desc: "7-day streak", icon: "⚡" },
    { id: "streak_30", title: "Unstoppable", desc: "30-day streak", icon: "🐉" },
    { id: "streak_100", title: "Century Club", desc: "100-day streak", icon: "👑" },
    { id: "perfect_5", title: "Perfectionist", desc: "5 perfect lessons", icon: "💯" },
    { id: "perfect_20", title: "Flawless", desc: "20 perfect lessons", icon: "✨" },
    { id: "xp_500", title: "Rising Star", desc: "Earn 500 XP", icon: "⭐" },
    { id: "xp_2000", title: "Language Guru", desc: "Earn 2,000 XP", icon: "🚀" },
    { id: "xp_10000", title: "Legend", desc: "Earn 10,000 XP", icon: "🏆" },
    { id: "league_join", title: "League Player", desc: "Join your first league", icon: "🥊" },
    { id: "league_promo", title: "Promoted!", desc: "Finish top 3 in a league", icon: "🎖️" },
    { id: "gems_500", title: "Gem Collector", desc: "Hold 500 diamonds", icon: "💎" },
    { id: "gems_2000", title: "Diamond Tycoon", desc: "Hold 2,000 diamonds", icon: "💰" },
    { id: "words_100", title: "Word Wizard", desc: "100 correct answers", icon: "📚" },
];

module.exports = {
    LEAGUE_TIERS, LEAGUE_SIZE, PROMOTE_N, RELEGATE_N, MAX_HEARTS,
    HEARTS_REFILL_COST, STREAK_FREEZE_COST, STREAK_REPAIR_COST, TIP_FRIEND_COST, COMEBACK_BONUS_GEMS,
    todayKey, seasonKey, regenHearts, levelFromXp, levelProgress,
    buildQuestions, buildDailyQuests, checkAchievements, ACHIEVEMENTS, maxHearts: () => MAX_HEARTS,
};