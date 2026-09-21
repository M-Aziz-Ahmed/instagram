"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";

const MAX_HEARTS = 5;

export default function LessonPlayer() {
    const { courseId, lessonId } = useParams();
    const router = useRouter();

    const [lesson, setLesson] = useState(null);
    const [questions, setQuestions] = useState(null);
    const [me, setMe] = useState(null);
    const [phase, setPhase] = useState("loading"); // loading | question | gameover | complete
    const [qi, setQi] = useState(0);
    const [correctCount, setCorrectCount] = useState(0);
    const [hearts, setHearts] = useState(MAX_HEARTS);
    const [result, setResult] = useState(null);
    const [error, setError] = useState("");

    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const r = await fetch(`/api/learn/lesson/${courseId}/${lessonId}`, { credentials: "include" });
                const d = await r.json();
                if (!r.ok) {
                    if (alive) setError(d.error || "Failed to load lesson");
                    return;
                }
                if (!alive) return;
                setLesson(d.lesson);
                setQuestions(d.questions);
                setMe(d.me);
                setHearts(Math.max(0, d.me?.hearts ?? MAX_HEARTS));
                setPhase(d.questions?.length ? "question" : "complete");
            } catch {
                if (alive) setError("Failed to load lesson");
            }
        })();
        return () => { alive = false; };
    }, [courseId, lessonId]);

    const hurt = useCallback((n = 1) => {
        setHearts((h) => {
            const next = Math.max(0, h - n);
            if (next === 0) {
                setTimeout(() => setPhase((p) => (p === "question" ? "gameover" : p)), 700);
            }
            return next;
        });
    }, []);

    const submitComplete = useCallback(async (correct, total) => {
        try {
            const r = await fetch("/api/learn/lesson/complete", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ courseId, lessonId, correct, total, perfect: correct === total, practice: false }),
            });
            const d = await r.json();
            setResult({ ...(d.rewards || { xp: 0, gems: 0, perfect: false }), newAchievements: d.newAchievements || [], me: d.me });
        } catch {
            setResult({ xp: 0, gems: 0, perfect: false, newAchievements: [], me: null });
        }
        setPhase("complete");
    }, [courseId, lessonId]);

    const restart = useCallback(() => {
        setQi(0);
        setCorrectCount(0);
        setPhase("question");
    }, []);

    const refillHearts = async () => {
        const r = await fetch("/api/learn/hearts/refill", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
        });
        if (r.ok) {
            const d = await r.json();
            setMe(d.me);
            setHearts(MAX_HEARTS);
            restart();
        }
    };

    const handleEnd = useCallback((isCorrect) => {
        const finalCorrect = correctCount + (isCorrect ? 1 : 0);
        setCorrectCount(finalCorrect);
        const next = qi + 1;
        if (next >= (questions?.length || 0)) {
            submitComplete(finalCorrect, questions?.length || 0);
        } else {
            setQi(next);
        }
    }, [correctCount, qi, questions, submitComplete]);

    const goHome = () => router.push(`/education/course/${courseId}`);
    const rtl = lesson?.rtl;

    // ── Screens ────────────────────────────────────────────────
    if (error) {
        return (
            <div className="min-h-screen bg-white dark:bg-gray-950 flex items-center justify-center p-6">
                <div className="text-center max-w-sm">
                    <span className="text-4xl block mb-3">🌵</span>
                    <p className="font-extrabold text-lg text-gray-800 dark:text-gray-100 mb-2">Lesson unavailable</p>
                    <p className="text-sm text-gray-400 mb-5">{error}</p>
                    <button onClick={goHome} className="px-6 py-3 rounded-2xl bg-[#58cc02] text-white font-extrabold text-sm hover:bg-[#46a302]">
                        Back to course
                    </button>
                </div>
            </div>
        );
    }

    if (phase === "loading") {
        return (
            <div className="min-h-screen bg-white dark:bg-gray-950 flex items-center justify-center">
                <div className="w-9 h-9 border-2 border-gray-300 dark:border-gray-700 border-t-[#58cc02] rounded-full animate-spin" />
            </div>
        );
    }

    if (phase === "gameover") {
        return (
            <div className="min-h-screen bg-white dark:bg-gray-950 flex flex-col">
                <div className="sticky top-0 z-20 bg-white dark:bg-gray-950 border-b border-gray-100 dark:border-gray-800">
                    <div className="max-w-2xl mx-auto px-4 h-16 flex items-center justify-between">
                        <button onClick={goHome} className="p-1.5 -ml-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg">✕</button>
                        <Hearts hearts={hearts} />
                    </div>
                </div>
                <div className="flex-1 flex items-center justify-center p-6">
                    <div className="w-full max-w-sm text-center">
                        <span className="text-5xl block mb-3">😵</span>
                        <h1 className="font-extrabold text-2xl text-gray-800 dark:text-gray-100">Out of Hearts!</h1>
                        <p className="text-sm text-gray-400 mt-2 mb-6">
                            Refill instantly for 150 💎, or come back later — hearts regenerate 1 every 30 minutes.
                        </p>
                        <button
                            onClick={refillHearts}
                            disabled={(me?.gems || 0) < 150}
                            className="w-full py-3.5 rounded-2xl bg-[#ffc800] text-gray-900 font-extrabold text-sm hover:bg-yellow-500 disabled:bg-gray-200 dark:disabled:bg-gray-800 disabled:text-gray-400"
                        >
                            Refill hearts · 150 💎
                        </button>
                        <button onClick={goHome} className="w-full py-3.5 rounded-2xl mt-3 border-2 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-300 font-extrabold text-sm hover:bg-gray-50 dark:hover:bg-gray-900">
                            Give up and go back
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (phase === "complete") {
        const r = result || {};
        const pct = Math.round((correctCount / (questions?.length || 1)) * 100);
        return (
            <div className="min-h-screen bg-white dark:bg-gray-950 flex flex-col">
                <div className="sticky top-0 z-20 bg-white dark:bg-gray-950 border-b border-gray-100 dark:border-gray-800">
                    <div className="max-w-2xl mx-auto px-4 h-16 flex items-center justify-between">
                        <button onClick={goHome} className="p-1.5 -ml-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg">✕</button>
                        <p className="text-sm font-extrabold text-gray-400">LESSON COMPLETE</p>
                    </div>
                </div>
                <div className="flex-1 flex items-center justify-center p-6">
                    <div className="w-full max-w-md text-center">
                        <span className="text-5xl block mb-3">🎉</span>
                        <h1 className="font-extrabold text-2xl text-gray-800 dark:text-gray-100">
                            {r.perfect ? "Perfect!" : "Nice job!"}
                        </h1>
                        <p className="text-sm text-gray-400 mt-1 mb-6">
                            You completed {questions?.length} questions at {pct}% accuracy.
                        </p>

                        <div className="grid grid-cols-2 gap-3 mb-6">
                            <div className="bg-white dark:bg-gray-900 border-2 border-gray-100 dark:border-gray-800 rounded-2xl p-4">
                                <span className="block text-2xl">⚡</span>
                                <span className="block font-extrabold text-xl text-gray-800 dark:text-gray-100">+{r.xp || 0} XP</span>
                                <span className="text-[10px] font-bold text-gray-400">EARNED{r.perfect ? " · PERFECT BONUS" : ""}</span>
                            </div>
                            <div className="bg-white dark:bg-gray-900 border-2 border-gray-100 dark:border-gray-800 rounded-2xl p-4">
                                <span className="block text-2xl">💎</span>
                                <span className="block font-extrabold text-xl text-gray-800 dark:text-gray-100">+{r.gems || 0}</span>
                                <span className="text-[10px] font-bold text-gray-400">DIAMONDS</span>
                            </div>
                        </div>

                        <div className="flex items-center justify-center gap-6 mb-6 text-sm text-gray-600 dark:text-gray-300">
                            <span>🔥 Streak: <b>{r.me?.streak ?? me?.streak} days</b></span>
                            <span>🏅 Level {r.me?.level ?? me?.level}</span>
                        </div>

                        {(r.newAchievements || []).map((a) => (
                            <div key={a.id} className="flex items-center gap-3 bg-[#ffc800]/15 border-2 border-[#ffc800] rounded-2xl p-4 mb-4 text-left">
                                <span className="text-3xl">{a.icon}</span>
                                <div>
                                    <p className="text-[10px] font-extrabold tracking-wider text-[#b38003] dark:text-[#ffd700]">BADGE UNLOCKED</p>
                                    <p className="font-extrabold text-sm text-gray-800 dark:text-gray-100">{a.title} · {a.desc}</p>
                                </div>
                            </div>
                        ))}

                        <button onClick={goHome} className="w-full py-3.5 rounded-2xl bg-[#58cc02] hover:bg-[#46a302] text-white font-extrabold text-sm">
                            CONTINUE
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    const q = questions[qi];

    return (
        <div className="min-h-screen bg-white dark:bg-gray-950 flex flex-col">
            {/* Top bar */}
            <div className="sticky top-0 z-20 bg-white dark:bg-gray-950 border-b border-gray-100 dark:border-gray-800">
                <div className="max-w-2xl mx-auto px-4 h-16 flex items-center gap-4">
                    <button onClick={goHome} className="p-1.5 -ml-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg">✕</button>
                    <div className="flex-1 relative h-4">
                        <div className="absolute inset-0 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                            <div className="h-full bg-[#58cc02] rounded-full transition-all duration-500" style={{ width: `${(qi / (questions?.length || 1)) * 100}%` }} />
                        </div>
                        <span className="absolute right-0 -top-3 text-lg">🐦</span>
                    </div>
                    <Hearts hearts={hearts} />
                </div>
            </div>

            {/* Question card */}
            <div className="flex-1 w-full max-w-2xl mx-auto px-4 py-8">
                <QuestionCard
                    key={q.id}
                    q={q}
                    rtl={rtl}
                    hl={lesson?.hl}
                    hearts={hearts}
                    hurt={hurt}
                    onCheck={handleEnd}
                />
            </div>
        </div>
    );
}

function Hearts({ hearts }) {
    return (
        <div className="flex items-center gap-1 shrink-0">
            {Array.from({ length: MAX_HEARTS }).map((_, i) => (
                <svg key={i} className={`w-6 h-6 transition-all ${i < hearts ? "text-red-500" : "text-gray-300 dark:text-gray-700 scale-75"}`} viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 21s-6.7-4.35-9.33-8.11C.9 10.13 1.74 6.59 4.5 5.5c2.2-.87 4.44.15 5.5 2.09 1.06-1.94 3.3-2.96 5.5-2.09 2.76 1.09 3.6 4.63 1.83 7.39C18.7 16.65 12 21 12 21z" />
                </svg>
            ))}
        </div>
    );
}

// ── Question renderer ─────────────────────────────────────────
function speakText(text, lang) {
    if (!text || typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang || "en-US";
    u.rate = 0.85;
    window.speechSynthesis.speak(u);
}

function Gloss({ text }) {
    if (!text) return null;
    return <span className="block text-xs font-semibold text-gray-400 dark:text-gray-500 mt-0.5 tracking-wide" dir="ltr">{text}</span>;
}

function normalizeSpeech(s) {
    return (s || "")
        .toLowerCase()
        .replace(/[.,!?;:""''„“”‘’—–()]/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

function speechMatch(heard, expect) {
    const h = normalizeSpeech(heard);
    const e = normalizeSpeech(expect);
    if (!h) return false;
    if (!e) return true;
    if (h === e) return true;
    if (h.includes(e) || e.includes(h)) return true;
    const hw = h.split(" ");
    const ew = e.split(" ");
    const overlap = hw.filter((w) => ew.includes(w)).length;
    return overlap / ew.length >= 0.7;
}

function speechRecAvailable() {
    return typeof window !== "undefined" && !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

function SpeakBtn({ text, lang }) {
    if (!text) return null;
    return (
        <button
            type="button"
            aria-label="Pronounce"
            onClick={(e) => { e.stopPropagation(); speakText(text, lang); }}
            className="w-9 h-9 rounded-full bg-[#1cb0f6]/10 text-[#1cb0f6] hover:bg-[#1cb0f6]/20 flex items-center justify-center shrink-0"
        >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M3 9v6h4l5 5V4L7 9H3z" />
                <path d="M16.5 12a4.5 4.5 0 0 0-2.5-4.03v8.05A4.5 4.5 0 0 0 16.5 12z" />
            </svg>
        </button>
    );
}

function QuestionCard({ q, rtl, hl, hearts, hurt, onCheck }) {
    const [choice, setChoice] = useState(null);
    const [answer, setAnswer] = useState("");
    const [bank, setBank] = useState(q.bank);
    const [checked, setChecked] = useState(false);
    const [correct, setCorrect] = useState(false);
    const [heard, setHeard] = useState("");
    const [srStatus, setSrStatus] = useState("idle"); // idle | listening | heard | unsupported
    const recRef = useRef(null);

    const applyResult = (isCorrect) => {
        setChecked(true);
        setCorrect(isCorrect);
        if (!isCorrect) hurt(1);
    };

    const stopRec = () => {
        if (recRef.current) {
            try { recRef.current.stop(); } catch {}
            recRef.current = null;
        }
    };

    const startRec = () => {
        if (!speechRecAvailable()) {
            setSrStatus("unsupported");
            return;
        }
        stopRec();
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        const r = new SR();
        r.lang = hl || "en-US";
        r.interimResults = false;
        r.maxAlternatives = 1;
        r.onresult = (e) => {
            const t = e.results?.[0]?.[0]?.transcript || "";
            if (t) setHeard(t);
            setSrStatus("heard");
            stopRec();
        };
        r.onerror = () => { stopRec(); setSrStatus((s) => (s === "heard" ? s : "idle")); };
        r.onend = () => { recRef.current = null; setSrStatus((s) => (s === "listening" ? "idle" : s)); };
        recRef.current = r;
        setSrStatus("listening");
        try { r.start(); } catch { setSrStatus("idle"); }
    };

    useEffect(() => {
        return () => stopRec();
    }, []);

    const check = () => {
        if (q.type === "select" || q.type === "listen") {
            applyResult(choice !== null && choice === q.correctIndex);
        } else if (q.type === "wordbank") {
            const expected = q.tokens.join(" ").trim().toLowerCase().replace(/\s+/g, " ");
            const actual = answer.trim().toLowerCase().replace(/\s+/g, " ");
            applyResult(expected === actual);
        } else if (q.type === "speak") {
            const supported = speechRecAvailable();
            applyResult(supported ? speechMatch(heard, q.expect) : true);
        }
    };

    const pickChip = (w, i) => {
        setAnswer((a) => (a ? `${a} ${w}` : w));
        setBank((b) => b.filter((_, j) => j !== i));
    };
    const chipBack = (i) => {
        const parts = answer.trim().split(/\s+/).filter(Boolean);
        const rest = parts.slice(0, i).concat(parts.slice(i + 1));
        setAnswer(rest.join(" "));
        setBank((b) => [...b, parts[i]]);
    };
    const popChip = () => {
        setAnswer((a) => {
            const parts = a.trim().split(/\s+/).filter(Boolean);
            const w = parts.pop();
            if (w) setBank((b) => [...b, w]);
            return parts.join(" ");
        });
    };

    const playAudio = () => speakText(q.speak, hl);

    const targetDir = !q.reverse; // wordbank needing target-language assembly reads RTL
    const phrase = q.prompt.match(/“(.+)”/)?.[1] || "";
    const isRtl = q.type !== "select" && q.type !== "listen" && targetDir && rtl;

    const canCheck =
        q.type === "select" || q.type === "listen"
            ? choice !== null
            : q.type === "wordbank"
            ? answer.trim().length > 0
            : q.type === "speak"
            ? speechRecAvailable()
                ? heard.trim().length > 0 || srStatus !== "listening"
                : true
            : false;

    const optionClass = (i, isCorrectOption) => {
        if (checked && isCorrectOption) return "border-[#58cc02] bg-[#58cc02]/10 text-[#58cc02]";
        if (checked && i === choice) return "border-red-500 bg-red-500/10 text-red-500";
        if (i === choice) return "border-[#1cb0f6] bg-[#1cb0f6]/10 text-gray-800 dark:text-gray-100";
        return "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 hover:border-[#1cb0f6]";
    };

    return (
        <div className="flex flex-col min-h-[70vh]">
            <div className="flex-1 text-center">
                {/* Select / reverse-select */}
                {q.type === "select" && (
                    <>
                        {q.prompt.startsWith("What does") ? (
                            <div className="mb-6">
                                <p className="text-sm font-bold text-gray-400 dark:text-gray-500 mb-3">What does this mean?</p>
                                <div className="inline-flex items-center justify-center gap-3 px-5 py-3 rounded-2xl bg-gray-50 dark:bg-gray-900 border-2 border-gray-100 dark:border-gray-800">
                                    <span className="text-2xl font-extrabold text-gray-800 dark:text-gray-100 leading-snug" dir="ltr">{q.item?.t}</span>
                                    <SpeakBtn text={q.item?.t} lang={hl} />
                                </div>
                                <div className="mt-2"><Gloss text={q.item?.gloss} /></div>
                            </div>
                        ) : (
                            <p className="text-lg font-extrabold text-gray-800 dark:text-gray-100 leading-snug mb-6">{q.prompt}</p>
                        )}
                        <div className="grid grid-cols-1 gap-3 max-w-md mx-auto">
                            {q.options.map((o, i) => (
                                <button
                                    key={i}
                                    onClick={() => {
                                        if (!checked) setChoice(i);
                                        if (q.prompt.startsWith("Which of these")) speakText(o, hl);
                                    }}
                                    className={`p-4 rounded-2xl border-2 text-sm font-bold transition-all text-left flex items-center justify-between ${optionClass(i, i === q.correctIndex)}`}
                                >
                                    <span className="flex flex-col flex-1">
                                        <span dir={qPromptDir(q)}>{o}</span>
                                        {q.glosses?.[i] && <Gloss text={q.glosses[i]} />}
                                    </span>
                                    {q.emojis?.[i] && <span className="text-xl">{q.emojis[i]}</span>}
                                </button>
                            ))}
                        </div>
                    </>
                )}

                {/* Listen */}
                {q.type === "listen" && (
                    <>
                        <p className="text-lg font-extrabold text-gray-800 dark:text-gray-100 leading-snug mb-6">🔊 {q.prompt}</p>
                        <button
                            onClick={playAudio}
                            className="w-20 h-20 mx-auto rounded-full bg-[#1cb0f6] hover:bg-[#1899d6] text-white flex items-center justify-center shadow-lg"
                            aria-label="Play audio"
                        >
                            <svg className="w-10 h-10" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M8 5v14l11-7z" />
                            </svg>
                        </button>
                        <div className="grid grid-cols-1 gap-3 max-w-md mx-auto mt-6">
                            {q.options.map((o, i) => (
                                <button
                                    key={i}
                                    onClick={() => !checked && setChoice(i)}
                                    className={`p-4 rounded-2xl border-2 text-sm font-bold transition-all text-left ${optionClass(i, i === q.correctIndex)}`}
                                >
                                    {o}
                                </button>
                            ))}
                        </div>
                    </>
                )}

                {/* Wordbank */}
                {q.type === "wordbank" && (
                    <>
                        <p className="text-sm font-bold text-gray-400 dark:text-gray-500 mb-2">{q.prompt.replace(/“.+”/, "…")}</p>
                        <div className="flex items-center justify-center gap-3 mb-4 max-w-full">
                            <p className="text-xl font-extrabold text-gray-700 dark:text-gray-200 leading-snug" dir={rtl && !q.reverse ? "rtl" : "ltr"}>
                                {phrase}
                            </p>
                            <SpeakBtn text={q.phrase?.t} lang={hl} />
                        </div>
                        {q.phrase?.gloss && <p className="mb-4"><Gloss text={q.phrase.gloss} /></p>}
                        <div className={`min-h-[64px] px-3 py-2 rounded-2xl border-2 border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 flex flex-wrap items-center gap-2 justify-center mb-5`} dir={isRtl ? "rtl" : "ltr"}>
                            {answer.split(" ").filter(Boolean).map((w, i) => (
                                <button key={i} onClick={() => !checked && chipBack(i)} className="px-3 py-1.5 rounded-lg bg-[#1cb0f6] text-white text-sm font-bold">
                                    {w}
                                </button>
                            ))}
                            {!answer && <span className="text-gray-300 dark:text-gray-600 text-sm">Tap the words below</span>}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 justify-center" dir={isRtl ? "rtl" : "ltr"}>
                            {bank.map((w, i) => (
                                <button key={`${w}-${i}`} onClick={() => !checked && pickChip(w, i)} className="px-4 py-2 rounded-xl bg-white dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-700 text-sm font-bold text-gray-700 dark:text-gray-200 hover:border-[#1cb0f6]">
                                    {w}
                                </button>
                            ))}
                        </div>
                        {answer && !checked && (
                            <button onClick={popChip} className="mt-4 text-[#1cb0f6] text-xs font-extrabold tracking-wide">⌫ BACKSPACE</button>
                        )}
                    </>
                )}

                {/* Speak */}
                {q.type === "speak" && (
                    <>
                        <p className="text-sm font-bold text-gray-400 dark:text-gray-500 mb-1">🗣️ {q.prompt}</p>
                        <div className="inline-flex items-center justify-center gap-3 px-5 py-3 rounded-2xl bg-gray-50 dark:bg-gray-900 border-2 border-gray-100 dark:border-gray-800 mb-2">
                            <span className="text-2xl">{q.emoji}</span>
                            <span className="text-xl font-extrabold text-gray-800 dark:text-gray-100 leading-snug">{q.say}</span>
                            <SpeakBtn text={q.expect} lang={hl} />
                        </div>
                        <Gloss text={q.gloss} />
                        <p className="text-xs text-gray-400 mt-3 mb-5">Tap and hold the mic to record yourself saying the translation.</p>

                        {speechRecAvailable() ? (
                            <div className="flex flex-col items-center gap-3">
                                <button
                                    onMouseDown={startRec}
                                    onTouchStart={startRec}
                                    onMouseUp={stopRec}
                                    onTouchEnd={stopRec}
                                    className={`w-24 h-24 mx-auto rounded-full flex items-center justify-center shadow-lg transition-colors ${
                                        srStatus === "listening"
                                            ? "bg-red-500 hover:bg-red-600"
                                            : "bg-[#1cb0f6] hover:bg-[#1899d6]"
                                    } text-white`}
                                    aria-label="Record"
                                >
                                    {srStatus === "listening" ? (
                                        <span className="w-10 h-10 rounded-full bg-white/25 animate-ping" />
                                    ) : (
                                        <svg className="w-9 h-9" fill="currentColor" viewBox="0 0 24 24">
                                            <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3z" />
                                            <path d="M17 11a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z" />
                                        </svg>
                                    )}
                                </button>
                                <p className="text-xs font-bold text-gray-400">
                                    {srStatus === "listening" ? "Listening…" : srStatus === "heard" ? `You said: “${heard}”` : "Tap & speak"}
                                </p>
                            </div>
                        ) : (
                            <div className="max-w-sm mx-auto rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700 p-4">
                                <p className="text-sm text-gray-500 dark:text-gray-300">
                                    Speech recognition isn&apos;t supported in this browser. Tap the speaker to hear the phrase, then continue.
                                </p>
                            </div>
                        )}
                    </>
                )}

                {/* Match */}
                {q.type === "match" && <MatchGame pairs={q.pairs} hl={hl} hurt={hurt} onDone={(ok) => onCheck(ok)} />}
            </div>

            {/* Check bar */}
            {q.type !== "match" && (
                <div className="sticky bottom-0 bg-white dark:bg-gray-950 border-t border-gray-100 dark:border-gray-800 mt-6">
                    <div className="w-full max-w-2xl mx-auto px-4 py-4 flex items-center gap-4">
                        {checked && (
                            <span className={`text-2xl w-8 ${correct ? "text-[#58cc02]" : "text-red-500"}`}>{correct ? "✅" : `❤️ ${hearts}`}</span>
                        )}
                        <button
                            onClick={checked ? () => onCheck(correct) : check}
                            disabled={!checked && !canCheck}
                            className={`flex-1 py-3.5 rounded-2xl font-extrabold text-sm transition-colors ${
                                checked
                                    ? correct
                                        ? "bg-[#58cc02] hover:bg-[#46a302] text-white"
                                        : "bg-red-500 hover:bg-red-600 text-white"
                                    : "bg-[#58cc02] hover:bg-[#46a302] text-white disabled:bg-gray-200 dark:disabled:bg-gray-800 disabled:text-gray-400"
                            }`}
                        >
                            {checked ? "CONTINUE" : "CHECK"}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

function qPromptDir(q) {
    if (q.type === "select") {
        // reverse select shows target phrase → keep LTR here, the review answer is language-dependent
        return "ltr";
    }
    return "ltr";
}

// ── Match game ────────────────────────────────────────────────
function MatchGame({ pairs, hl, hurt, onDone }) {
    const [tiles, setTiles] = useState(() => [...pairs].map((p) => p.t).sort(() => Math.random() - 0.5));
    const [selLeft, setSelLeft] = useState(null);
    const [selRight, setSelRight] = useState(null);
    const [paired, setPaired] = useState({});
    const [shake, setShake] = useState(false);
    const glossMap = Object.fromEntries((pairs || []).map((p) => [p.t, p.gloss]));

    const tryPair = (li, ri) => {
        const p = pairs.find((x) => x.e === left[li] && x.t === tiles[ri]);
        if (p) {
            const next = { ...paired, [left[li]]: tiles[ri] };
            setPaired(next);
            setSelLeft(null);
            setSelRight(null);
            if (Object.keys(next).length === pairs.length) {
                setTimeout(() => onDone(true), 450);
            }
        } else {
            hurt(1);
            setShake(true);
            setTimeout(() => { setShake(false); setSelLeft(null); setSelRight(null); }, 450);
        }
    };

    const left = pairs.map((p) => p.e);

    return (
        <>
            <p className="text-lg font-extrabold text-gray-800 dark:text-gray-100 mb-1">Match the pairs</p>
            <p className="text-xs text-gray-400 mb-5">Pair each English word with its translation.</p>
            <div className={`flex flex-col items-center gap-4 ${shake ? "animate-pulse" : ""}`}>
                <div className="flex flex-wrap items-center justify-center gap-3 max-w-md">
                    {left.map((e, i) => (
                        <button
                            key={e}
                            onClick={() => { if (paired[e] || shake) return; setSelLeft(i); setSelRight(null); }}
                            className={`px-5 py-3 rounded-xl border-2 text-sm font-bold transition-all ${
                                paired[e]
                                    ? "border-[#58cc02] bg-[#58cc02]/10 text-[#58cc02] line-through"
                                    : selLeft === i
                                    ? "border-[#1cb0f6] bg-[#1cb0f6]/10 text-gray-800 dark:text-gray-100"
                                    : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 hover:border-[#1cb0f6]"
                            }`}>
                            {e}
                        </button>
                    ))}
                </div>
                <div className="flex flex-wrap items-center justify-center gap-3 max-w-md">
                    {tiles.map((t, ri) => (
                        <button
                            key={`${t}-${ri}`}
                            onClick={() => {
                                speakText(t, hl);
                                if (shake) return;
                                if (selLeft !== null) tryPair(selLeft, ri);
                                else setSelRight(ri);
                            }}
                            className={`px-5 py-3 rounded-xl border-2 text-sm font-bold transition-all ${
                                Object.values(paired).includes(t)
                                    ? "border-[#58cc02] bg-[#58cc02]/10 text-[#58cc02] line-through"
                                    : selRight === ri
                                    ? "border-[#1cb0f6] bg-[#1cb0f6]/10 text-gray-800 dark:text-gray-100"
                                    : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 hover:border-[#1cb0f6]"
                            }`}>
                            <span className="flex flex-col items-center">
                                {t}
                                {glossMap[t] && <Gloss text={glossMap[t]} />}
                            </span>
                        </button>
                    ))}
                </div>
            </div>
        </>
    );
}