// ─────────────────────────────────────────────────────────────
// Education sub-app: the comprehensive curriculum engine.
//
// Every playable language gets a full course of:
//   50 chapters × 10 steps × 5 lessons  = 2500 lesson nodes
//
// The 5 lessons inside each step are:
//   1-4  practice lessons (sight/recognition, reading, listening,
//        building sentences — the existing Duolingo-style drills)
//   5    alternates between:
//        · "Speak up"  (pronounce words/sentences, checked by
//          speech-to-text) on odd steps
//        · "Story time" (listen to a short story, answer
//          comprehension questions) on even steps
//
// Difficulty escalates steadily: chapters 1-2 assume zero prior
// knowledge, then ramp 1 → 10 across the full 50 chapters.
//
// Content comes from per-language translation tables (core lessons
// translated for all 35 playable languages) plus optional deep
// theme files in live-server/learnDeep/<lang>.js. Adding a deep
// file for a language automatically enriches every chapter that
// currently rotates through its core themes.
// ─────────────────────────────────────────────────────────────

const { LESSONS: DEEP_LESSONS } = require("./learnDeepEnglish");

const CHAPTER_COUNT = 50;
const STEPS_PER_CHAPTER = 10;
const LESSONS_PER_STEP = 5;

// Pedagogic theme order. The 8 beginner core themes always come
// first (chapters 1-8 = zero-knowledge friendly), then progressively
// harder themes.
const CORE_ORDER = ["basics", "greetings", "numbers", "colors", "friends", "food", "travel", "people"];
const DEEP_ORDER = [
    "d11", "d21", "d22", "d23", "d24",
    "d31", "d32", "d33", "d41", "d42", "d43",
    "d51", "d52", "d53", "d61", "d62", "d63",
    "d71", "d72", "d73", "d81", "d82", "d83",
    "d91", "d92", "d93", "d101", "d102", "d103",
    "d111", "d112", "d113", "d121", "d122", "d123",
    "d131", "d132", "d133", "d141", "d142", "d143",
    "d151", "d152", "d153", "d161", "d162", "d163",
    "d171", "d172",
];

// Per-lesson labels for the 4 practice slots of each step.
const PRACTICE_LABELS = ["Words & sounds", "Translate it", "Listen & pick", "Build it"];

const TIERS = {
    1: "Beginner", 2: "Beginner", 3: "Novice", 4: "Novice",
    5: "Explorer", 6: "Explorer", 7: "Advanced", 8: "Advanced",
    9: "Expert", 10: "Master",
};

const TIER_COLORS = {
    1: "#58cc02", 2: "#58cc02", 3: "#1cb0f6", 4: "#1cb0f6",
    5: "#ffc800", 6: "#ffc800", 7: "#ce82ff", 8: "#ce82ff",
    9: "#ff9600", 10: "#ff9600",
};

function pad(n) { return String(n).padStart(2, "0"); }

// Difficulty (1-10) for a chapter number. Chapter 1-2 = difficulty 1
// (complete beginners), every 5 chapters bumps the intent one step.
function difficultyForChapter(ch) {
    return Math.min(10, 1 + Math.floor(Math.max(0, ch - 1) / 5));
}

function tierForDifficulty(d) {
    return TIERS[d] || TIERS[5];
}

function colorForDifficulty(d) {
    return TIER_COLORS[d] || TIER_COLORS[5];
}

// Which themes does this language actually have content for?
function availableThemes(deepForLang = {}) {
    const keys = [];
    for (const k of CORE_ORDER) keys.push(k);
    for (const k of DEEP_ORDER) {
        if (DEEP_LESSONS[k] && deepForLang[k]) keys.push(k);
    }
    return keys;
}

// A chapter themed from the languages available themes (cycled).
function themeForChapter(available, chapter) {
    if (!available.length) return CORE_ORDER[0];
    return available[(chapter - 1) % available.length];
}

// Resolve a theme key into a { name, vocab, phrases } content bundle for
// one language. Core themes come from the shared beginner tables; deep
// themes from the per-language deep files.
function resolveTheme(langId, themeKey, t, deepForLang = {}, coreBlueprints = {}) {
    if (t[themeKey]) {
        const core = coreBlueprints[themeKey] || { title: themeKey, vocab: [] };
        const emojiFor = (en) => {
            const v = (core.vocab || []).find(([e]) => e === en);
            return v ? v[2] : "";
        };
        const vocab = t[themeKey]
            .map(([e, target, gloss]) => ({ e, t: target, emoji: emojiFor(e), gloss: gloss || "" }))
            .filter((v) => v.t);
        const phrases = ((t._phrases && t._phrases[themeKey]) || [])
            .map(([e, target, gloss]) => ({ e, t: target, gloss: gloss || "" }))
            .filter((p) => p.t);
        return { name: core.title || themeTitle(themeKey), vocab, phrases };
    }
    const dl = deepForLang[themeKey];
    const blueprint = DEEP_LESSONS[themeKey];
    if (dl && blueprint) {
        const emojiFor = (en) => {
            const v = (blueprint.vocab || []).find(([e]) => e === en);
            return v ? v[2] : "";
        };
        const vocab = (dl.vocab || []).map(([e, target, gloss]) => ({
            e, t: target || e, emoji: emojiFor(e), gloss: gloss || "",
        }));
        const phrases = (dl.phrases || []).map(([e, target, gloss]) => ({ e, t: target || e, gloss: gloss || "" }));
        return {
            name: blueprint.title,
            vocab: vocab.filter((_) => _.t),
            phrases: phrases.filter((_) => _.t),
        };
    }
    // English blueprint fallback (never silently wrong: used when a theme
    // is requested but has no translations — not reachable in practice).
    const bp = DEEP_LESSONS[themeKey] || { title: themeKey, vocab: [], phrases: [] };
    return {
        name: bp.title,
        vocab: (bp.vocab || []).map(([e, , emoji]) => ({ e, t: e, emoji, gloss: "" })),
        phrases: (bp.phrases || []).map(([e]) => ({ e, t: e, gloss: "" })),
    };
}

function themeTitle(themeKey) {
    return (DEEP_LESSONS[themeKey] && DEEP_LESSONS[themeKey].title) || themeKey;
}

function buildStepPronunciation(langId, chapter, step, theme) {
    return {
        id: `${langId}-c${pad(chapter)}-s${step}-speak`,
        title: `${theme.name} · Speak up`,
        type: "pronounce",
        xp: 12,
        difficulty: difficultyForChapter(chapter),
        vocab: theme.vocab,
        phrases: theme.phrases,
    };
}

function buildStepStory(langId, chapter, step, theme) {
    return {
        id: `${langId}-c${pad(chapter)}-s${step}-story`,
        title: `${theme.name} · Story time`,
        type: "story",
        xp: 15,
        difficulty: difficultyForChapter(chapter),
        vocab: theme.vocab,
        phrases: theme.phrases,
    };
}

// Build the 10 steps (×5 lessons) of a single chapter.
function buildChapterSteps(langId, chapter, theme) {
    const steps = [];
    for (let s = 1; s <= STEPS_PER_CHAPTER; s++) {
        const lessons = [];
        for (let m = 1; m <= 4; m++) {
            lessons.push({
                id: `${langId}-c${pad(chapter)}-s${s}-l${m}`,
                title: `${theme.name} · ${PRACTICE_LABELS[m - 1]}`,
                type: "lesson",
                xp: 10,
                difficulty: difficultyForChapter(chapter),
                vocab: theme.vocab,
                phrases: theme.phrases,
            });
        }
        lessons.push(s % 2 === 1
            ? buildStepPronunciation(langId, chapter, s, theme)
            : buildStepStory(langId, chapter, s, theme));
        steps.push({
            id: `${langId}-c${pad(chapter)}-s${s}`,
            title: `Step ${s} · ${s % 2 === 1 ? "Practice" : "Stories"}`,
            lessons,
        });
    }
    return steps;
}

// ── The course factory ────────────────────────────────────────
// t = the language's core translation table, deepForLang = { deepId: {...} }
function buildCourseForLanguage(langId, t, deepForLang = {}, coreBlueprints = {}) {
    const available = availableThemes(deepForLang);
    const chapters = [];

    for (let ch = 1; ch <= CHAPTER_COUNT; ch++) {
        const themeKey = themeForChapter(available, ch);
        const theme = resolveTheme(langId, themeKey, t, deepForLang, coreBlueprints);
        const difficulty = difficultyForChapter(ch);
        chapters.push({
            id: `${langId}-ch${ch}`,
            chapter: ch,
            title: theme.name,
            theme: themeKey,
            difficulty,
            tier: tierForDifficulty(difficulty),
            color: colorForDifficulty(difficulty),
            steps: buildChapterSteps(langId, ch, theme),
        });
    }

    return { chapters };
}

// Flatten any nested course structure (unit-lessons in old data, or the
// new chapters → steps → lessons tree) into a stable linear lesson list.
function flattenLessons(course) {
    const out = [];
    for (const chapter of course.chapters || []) {
        for (const step of chapter.steps || []) {
            out.push(...(step.lessons || []));
        }
    }
    return out;
}

module.exports = {
    CHAPTER_COUNT, STEPS_PER_CHAPTER, LESSONS_PER_STEP,
    CORE_ORDER, DEEP_ORDER, PRACTICE_LABELS,
    difficultyForChapter, tierForDifficulty, colorForDifficulty,
    availableThemes, themeForChapter, buildCourseForLanguage, flattenLessons,
};