// Regression test: a lesson must only ever ask about vocabulary the learner has
// been taught by that point.
//
// A first attempt sampled generated questions looking for untaught words. That
// passed even with the bug deliberately reintroduced - sampling a few items from a
// 21,000-word pool essentially never lands on a future word, so the check had no
// detection power. A second attempt built the taught window for every lesson and
// ran out of memory. This walks each course once with a single running set and
// stops at the first violation.
//
// Run: node live-server/learnScope.test.js
const assert = require("node:assert/strict");
const { collectTaughtItems, collectCourseItems } = require("./learnHelpers");
const { COURSES } = require("./learnContent");

function lessonsOf(course) {
    const out = [];
    for (const chapter of course.chapters || course.units || []) {
        const lessons = chapter.steps ? chapter.steps.flatMap((s) => s.lessons) : chapter.lessons || [];
        for (const l of lessons) out.push(l);
    }
    return out;
}

const only = process.argv[2] || null;
let lessonsChecked = 0;
let failure = null;

outer:
for (const [courseId, course] of Object.entries(COURSES)) {
    if (!course) continue;
    if (only && courseId !== only) continue;
    const lessons = lessonsOf(course);
    if (lessons.length < 2) continue;

    // Running total of what has been introduced up to the current lesson.
    const seenVocab = new Set();
    const seenPhrases = new Set();

    for (let idx = 0; idx < lessons.length; idx++) {
        const lesson = lessons[idx];

        // The taught window for lesson i is lessons 0..i inclusive, so this lesson's
        // own words must be counted before checking the pool it produces.
        for (const w of lesson.vocab || []) seenVocab.add(w.t);
        for (const p of lesson.phrases || []) seenPhrases.add(p.t);

        // The last lesson of a course legitimately sees the whole course.
        if (idx < lessons.length - 1) {
            lessonsChecked++;
            const taught = collectTaughtItems(course, lesson.id);

            for (const w of taught.vocab) {
                if (!seenVocab.has(w.t)) {
                    failure = `${courseId}/${lesson.id} (lesson ${idx}/${lessons.length}): ` +
                        `taught pool contains "${w.t}", which is first introduced later`;
                    break outer;
                }
            }
            if (!failure) {
                for (const p of taught.phrases) {
                    if (!seenPhrases.has(p.t)) {
                        failure = `${courseId}/${lesson.id} (lesson ${idx}/${lessons.length}): ` +
                            `taught pool contains phrase "${p.t}", which is introduced later`;
                        break outer;
                    }
                }
            }
        }
    }
}

const sizes = Object.entries(COURSES).slice(0, 3)
    .map(([id, c]) => `${id}=${collectCourseItems(c).vocab.length} words/${lessonsOf(c).length} lessons`)
    .join("  ");
console.log(`whole-course size (what the old code used): ${sizes}`);
console.log(`checked ${lessonsChecked} lessons`);

if (failure) {
    console.log(`\nFAIL: ${failure}`);
    process.exit(1);
}
console.log("\nPASS: no lesson's taught pool contains vocabulary from a later lesson.");
