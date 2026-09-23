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
    const completingRef = useRef(false);

    // Questions are deterministic server-side, so we cache the last payload in
    // sessionStorage: re-opening a lesson renders instantly (before the network
    // round-trip below finishes) while the fetch refreshes hearts/progress.
    useEffect(() => {
        let alive = true;
        (async () => {
            let cached = null;
            try {
                cached = JSON.parse(sessionStorage.getItem(`learn:q:${courseId}:${lessonId}:v2`) || "null");
            } catch {}
            if (alive && cached?.questions?.length) {
                await Promise.resolve();
                if (!alive) return;
                setLesson(cached.lesson);
                setQuestions(cached.questions);
                setMe(cached.me || null);
                setHearts(Math.max(0, cached.me?.hearts ?? MAX_HEARTS));
                setPhase("question");
            }
            try {
                const r = await fetch(`/api/learn/lesson/${courseId}/${lessonId}`, { credentials: "include" });
                const d = await r.json();
                if (!r.ok) {
                    if (alive && !cached?.questions?.length) setError(d.error || "Failed to load lesson");
                    return;
                }
                if (!alive) return;
                setLesson(d.lesson);
                setQuestions(d.questions);
                setMe(d.me);
                setHearts(Math.max(0, d.me?.hearts ?? MAX_HEARTS));
                setPhase(d.questions?.length ? "question" : "complete");
                if (d.questions?.length) {
                    try { sessionStorage.setItem(`learn:q:${courseId}:${lessonId}:v2`, JSON.stringify(d)); } catch {}
                }
            } catch {
                if (alive && !cached?.questions?.length) setError("Failed to load lesson");
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
        if (completingRef.current) return;
        completingRef.current = true;
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
                {q.type === "learn" ? (
                    <LearnCard key={q.id} q={q} rtl={rtl} hl={lesson?.hl} onCheck={handleEnd} />
                ) : q.type === "pronounce" ? (
                    <PronounceCard key={q.id} q={q} rtl={rtl} hearts={hearts} hurt={hurt} onCheck={handleEnd} />
                ) : q.type === "story" ? (
                    <StoryCard key={q.id} q={q} rtl={rtl} hl={lesson?.hl} onCheck={handleEnd} />
                ) : q.type === "solve" ? (
                    <SolveCard key={q.id} q={q} hearts={hearts} hurt={hurt} onCheck={handleEnd} />
                ) : (
                    <QuestionCard
                        key={q.id}
                        q={q}
                        rtl={rtl}
                        hl={lesson?.hl}
                        hearts={hearts}
                        hurt={hurt}
                        onCheck={handleEnd}
                    />
                )}
            </div>
        </div>
    );
}

// ── First, let's learn ────────────────────────────────────────
// Non-graded flashcard pass shown at the start of beginner lessons: each new
// word/phrase of the lesson is presented with emoji, target text, meaning and
// audio before any quiz question expects the learner to already know it.
function LearnCard({ q, rtl, hl, onCheck }) {
    const items = q.items || [];
    const [idx, setIdx] = useState(0);
    const item = items[Math.min(idx, items.length - 1)];
    const last = idx >= items.length - 1;

    return (
        <div className="flex flex-col min-h-[70vh]">
            <div className="flex-1 text-center">
                <p className="text-sm font-bold text-gray-400 dark:text-gray-500 mb-4">🆕 {q.prompt}</p>

                {item && (
                    <>
                        <div className="flex items-center justify-center gap-2 mb-6">
                            {items.map((it, i) => (
                                <span
                                    key={i}
                                    className={`w-2.5 h-2.5 rounded-full ${i === idx ? "bg-[#58cc02]" : "bg-gray-200 dark:bg-gray-700"}`}
                                />
                            ))}
                        </div>
                        <div className="relative inline-flex items-center justify-center gap-4 px-8 py-6 rounded-3xl bg-gray-50 dark:bg-gray-900 border-2 border-gray-100 dark:border-gray-800">
                            <span className="text-4xl">{item.emoji || "💬"}</span>
                            <div className="text-left">
                                <p className="text-2xl font-extrabold text-gray-800 dark:text-gray-100 leading-snug" dir={rtl ? "rtl" : "ltr"}>{item.t}</p>
                                <p className="text-sm font-bold text-gray-500 dark:text-gray-400 mt-0.5">{item.e}</p>
                                {item.gloss && <Gloss text={item.gloss} />}
                            </div>
                            <SpeakBtn text={item.t} lang={hl} />
                        </div>
                        <p className="text-xs text-gray-400 mt-4">Tap the speaker to hear it said aloud.</p>
                    </>
                )}
            </div>

            <div className="sticky bottom-0 bg-white dark:bg-gray-950 border-t border-gray-100 dark:border-gray-800 mt-6">
                <div className="w-full max-w-2xl mx-auto px-4 py-4">
                    <button
                        onClick={() => (last ? onCheck(true) : setIdx((i) => i + 1))}
                        className="w-full py-3.5 rounded-2xl font-extrabold text-sm bg-[#58cc02] hover:bg-[#46a302] text-white"
                    >
                        {items.length === 1 ? "I'VE LEARNED IT — START QUIZ ▶" : last ? "I'VE LEARNED THESE — START QUIZ ▶" : "CONTINUE →"}
                    </button>
                </div>
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
// Text-to-speech with a robust fallback chain:
//   1. Native desktop TTS (Tauri → Windows System.Speech) — real voices,
//      works even for languages with no installed WebView2 voice pack.
//   2. Web Speech synthesis — only if a voice matching the language exists.
//   3. Online TTS audio stream — always available, any language.
// `speakText` guarantees sound plays everywhere AND that `onend` always
// fires — from a real "ended" event or a duration estimate on native paths.
function isDesktop() {
    return typeof window !== "undefined" && !!(window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke);
}

function canListen() {
    if (isDesktop()) return true;
    return typeof window !== "undefined" && !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

async function invokeTauri(cmd, args) {
    if (!isDesktop()) return null;
    try {
        return await window.__TAURI_INTERNALS__.invoke(cmd, args || {});
    } catch (err) {
        console.warn(`[learn] tauri ${cmd} failed:`, err);
        return null;
    }
}

let audioCtx = null;
// iOS / installed-PWA / WebView2 keep speechSynthesis and <audio> silent until
// a real user gesture unlocks audio. Resume a silent AudioContext inside the
// first click so TTS is audible in the installed app and on the desktop shell.
function ensureAudioUnlocked() {
    if (typeof window === "undefined") return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
        if (!audioCtx) audioCtx = new AC();
        if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
    } catch {
        // audio already usable; nothing to unlock
    }
}

let micReady = null;
// Installed PWAs / standalone iOS can lose the implicit mic grant a browser
// tab gets for webkitSpeechRecognition, so request it explicitly first.
function ensureMic() {
    if (micReady) return micReady;
    if (typeof navigator === "undefined" || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        return Promise.resolve(false);
    }
    micReady = navigator.mediaDevices
        .getUserMedia({ audio: true })
        .then((stream) => {
            stream.getTracks().forEach((t) => t.stop());
            return true;
        })
        .catch((err) => {
            console.warn("[learn] mic denied:", err?.name);
            micReady = null; // allow a retry on the next attempt
            return false;
        });
    return micReady;
}

function ttsEstimate(text) {
    return Math.max(1200, Math.min(10000, String(text || "").length * 90 + 350));
}

function pickVoice(lang) {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
    const voices = window.speechSynthesis.getVoices();
    if (!voices || !voices.length) return null;
    const want = (lang || "en").toLowerCase();
    const base = want.split("-")[0];
    return voices.find((v) => (v.lang || "").toLowerCase() === want)
        || voices.find((v) => (v.lang || "").toLowerCase().startsWith(base))
        || null;
}

function speakWeb(text, lang, onend) {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice(lang);
    if (v) u.voice = v;
    u.lang = lang || "en-US";
    u.rate = 0.85;
    if (onend) u.onend = onend;
    window.speechSynthesis.speak(u);
    // iOS quirks: a resume nudge right after speak() gets synthesis going.
    window.setTimeout(() => {
        if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
            window.speechSynthesis.pause();
            window.speechSynthesis.resume();
        }
    }, 0);
}

// Streaming audio from Google Translate's TTS endpoint. No API key needed;
// the client treats it as a plain audio stream.
function playAudioStream(text, lang, onend) {
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${encodeURIComponent(lang || "en")}&q=${encodeURIComponent(text)}`;
    const audio = new Audio(url);
    audio.preload = "auto";
    const played = audio.play();
    // The gesture context can be lost by the time this resolves (await/then);
    // give the browser a moment and retry once.
    if (played && typeof played.then === "function") {
        played.catch(() => {
            setTimeout(() => audio.play().catch(() => {}), 300);
        });
    }
    if (onend) {
        audio.addEventListener("ended", onend, { once: true });
        setTimeout(onend, ttsEstimate(text) + 2000); // blocked streams still release
    }
    return audio;
}

function fallbackSpeak(text, lang, onend) {
    if ("speechSynthesis" in window && pickVoice(lang)) {
        speakWeb(text, lang, onend);
        return null;
    }
    return playAudioStream(text, lang, onend);
}

function speakText(text, lang, onend) {
    if (!text || typeof window === "undefined") return null;
    ensureAudioUnlocked();
    if (isDesktop()) {
        // Retry the native TTS once — the very first call right after the app
        // starts can time out starting PowerShell before speech audio engages,
        // which would otherwise silently fall through to the online stream.
        const native = () => invokeTauri("native_tts", { text, lang: (lang || "en").split("-")[0] });
        native().then((ok) => {
            if (ok || !isDesktop()) {
                if (ok && onend) setTimeout(onend, ttsEstimate(text));
                return;
            }
            return native().then((ok2) => {
                if (ok2) {
                    if (onend) setTimeout(onend, ttsEstimate(text));
                } else {
                    fallbackSpeak(text, lang, onend);
                }
            });
        }).catch(() => fallbackSpeak(text, lang, onend));
        return null;
    }
    if ("speechSynthesis" in window && pickVoice(lang)) {
        speakWeb(text, lang, onend);
        return null;
    }
    return playAudioStream(text, lang, onend);
}

// Play a sequence with natural pacing; advances after each chunk finishes.
// A guard makes sure each line advances exactly once, no matter whether the
// "ended" callback or the safety timer arrives first.
function speakSequence(lines, lang, { sentenceDone = null, finished = null } = {}) {
    if (!lines || !lines.length) {
        if (finished) finished();
        return;
    }
    let i = 0;
    let timer = null;

    const next = () => {
        if (timer) { clearTimeout(timer); timer = null; }
        if (i >= lines.length) {
            if (finished) finished();
            return;
        }
        const line = lines[i++];
        const t = line.t || line;
        const useWebTTS = !isDesktop() && "speechSynthesis" in window && pickVoice(lang);
        if (useWebTTS) {
            speakText(t, lang, () => {
                if (timer) { clearTimeout(timer); timer = null; }
                if (sentenceDone) sentenceDone(line);
                next();
            });
            // broken synthesis (iOS) must not stall the chain
            timer = setTimeout(() => {
                timer = null;
                if (sentenceDone) sentenceDone(line);
                next();
            }, Math.max(2500, t.length * 90 + 1500));
        } else {
            // native/streaming emit no "ended" event → pace by duration estimate
            speakText(t, lang);
            timer = setTimeout(() => {
                timer = null;
                if (sentenceDone) sentenceDone(line);
                next();
            }, ttsEstimate(t));
        }
    };

    next();
}

// Speech-to-text with the same fallback philosophy:
//   1. Native desktop recognition (Tauri → Windows System.Speech, grammar-
//      constrained to the expected phrase) with confidence.
//   2. Web Speech API (SpeechRecognition) — after an explicit mic grant.
//   3. null → caller falls back to self-check (say it yourself, then ✓).
// Guarantees `onResult` fires exactly once (hard timeout guards engines that
// stay silent, e.g. desktop returning { text: "" } when nothing was heard).
function captureSpeech(expect, lang, onResult) {
    let settled = false;
    let guard = null;
    const finish = (r) => {
        if (settled) return;
        settled = true;
        if (guard) { clearTimeout(guard); guard = null; }
        onResult(r);
    };

    if (isDesktop()) {
        invokeTauri("recognize_speech", { expect, lang: (lang || "en").split("-")[0], timeoutMs: 8000 }).then((res) => {
            if (res && typeof res.text === "string" && res.text) {
                finish({ text: res.text, confidence: res.confidence || 0, source: "native" });
            } else {
                finish(null); // unavailable / nothing heard within the window
            }
        }).catch(() => finish(null));
        guard = setTimeout(() => finish(null), 11000);
        return () => {};
    }

    if (speechRecAvailable()) {
        ensureMic().then((granted) => {
            if (!granted) { finish(null); return; }
            const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
            const r = new SR();
            r.lang = lang || "en-US";
            r.interimResults = false;
            r.maxAlternatives = 1;
            r.onresult = (e) => {
                const t = e.results?.[0]?.[0]?.transcript || "";
                finish(t ? { text: t, confidence: e.results?.[0]?.[0]?.confidence || 0, source: "web" } : null);
            };
            r.onerror = () => finish(null);
            r.onend = () => finish(null); // no-op if a result already settled
            try { r.start(); } catch { finish(null); }
            setTimeout(() => finish(null), 12000); // hang guard
        });
        return () => {};
    }

    finish(null);
    return () => {};
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
        if (!canListen()) {
            setSrStatus("unsupported");
            return;
        }
        stopRec();
        setSrStatus("listening");

        // Desktop: the WebView2 has no SpeechRecognition, so use the Tauri
        // native engine (grammar constrained to the expected phrase).
        if (isDesktop()) {
            recRef.current = { stop: () => {} };
            captureSpeech(q.expect, hl, (r) => {
                recRef.current = null;
                if (r && r.text) {
                    setHeard(r.text);
                    setSrStatus("heard");
                } else {
                    setSrStatus((s) => (s === "heard" ? s : "idle"));
                }
            });
            return;
        }

        if (!speechRecAvailable()) {
            setSrStatus("unsupported");
            return;
        }
        // Installed PWAs / standalone iOS don't inherit the tab's mic grant —
        // request it explicitly, then start recognition inside the gesture.
        ensureMic().then((granted) => {
            if (!granted) { setSrStatus("unsupported"); return; }
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
        });
    };

    useEffect(() => {
        return () => stopRec();
    }, []);

    const check = () => {
        if (q.type === "select" || q.type === "listen" || q.type === "truefalse" || q.type === "mcq") {
            applyResult(choice !== null && choice === q.correctIndex);
        } else if (q.type === "wordbank") {
            const expected = q.tokens.join(" ").trim().toLowerCase().replace(/\s+/g, " ");
            const actual = answer.trim().toLowerCase().replace(/\s+/g, " ");
            applyResult(expected === actual);
        } else if (q.type === "speak") {
            const supported = canListen();
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
        q.type === "select" || q.type === "listen" || q.type === "truefalse" || q.type === "mcq"
            ? choice !== null
            : q.type === "wordbank"
            ? answer.trim().length > 0
            : q.type === "speak"
            ? canListen()
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
                {/* Multiple choice (subjects) — plain options, no emojis, with a
                    "why" solution panel revealed after checking. */}
                {q.type === "mcq" && (
                    <>
                        <p className="text-lg font-extrabold text-gray-800 dark:text-gray-100 leading-snug mb-6">{q.prompt}</p>
                        <div className="grid grid-cols-1 gap-3 max-w-md mx-auto">
                            {q.options.map((o, i) => (
                                <button
                                    key={i}
                                    onClick={() => !checked && setChoice(i)}
                                    className={`p-4 rounded-2xl border-2 text-lg font-extrabold transition-all flex items-center justify-center ${optionClass(i, i === q.correctIndex)}`}
                                >
                                    {o}
                                </button>
                            ))}
                        </div>
                        {checked && <SolutionPanel solution={q.solution} hl={hl} />}
                    </>
                )}

                {/* Select / reverse-select */}
                {q.type === "select" && (
                    <>
                        {q.prompt.startsWith("What does") ? (
                            <div className="mb-6">
                                <p className="text-sm font-bold text-gray-400 dark:text-gray-500 mb-3">What does this mean?</p>
                                <div className="inline-flex items-center justify-center gap-3 px-5 py-3 rounded-2xl bg-gray-50 dark:bg-gray-900 border-2 border-gray-100 dark:border-gray-800">
                                    <span className="text-2xl font-extrabold text-gray-800 dark:text-gray-100 leading-snug" dir={rtl ? "rtl" : "ltr"}>{q.item?.t}</span>
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
                                    <span dir={qPromptDir(q, rtl)}>{o}</span>
                                    {q.glosses?.[i] && <Gloss text={q.glosses[i]} />}
                                </span>
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

                {/* True / false (story comprehension) */}
                {q.type === "truefalse" && (
                    <>
                        <p className="text-sm font-bold text-gray-400 dark:text-gray-500 mb-3">🤔 {q.prompt}</p>
                        <div className="inline-flex items-center justify-center gap-3 max-w-md px-5 py-4 rounded-2xl bg-gray-50 dark:bg-gray-900 border-2 border-gray-100 dark:border-gray-800 mb-1">
                            <span className="text-lg font-extrabold text-gray-800 dark:text-gray-100 leading-snug">“{q.statement}”</span>
                            {q.speak && <SpeakBtn text={q.speak} lang={hl} />}
                        </div>
                        <div className="grid grid-cols-2 gap-3 max-w-md mx-auto mt-6">
                            {q.options.map((o, i) => (
                                <button
                                    key={i}
                                    onClick={() => !checked && setChoice(i)}
                                    className={`p-4 rounded-2xl border-2 text-sm font-extrabold transition-all ${optionClass(i, i === q.correctIndex)}`}
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

                        {canListen() ? (
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

// ── Step-by-step solution reveal ──────────────────────────────
// Shown after answering a subject question: numbered explanation steps,
// each with its own speaker button, plus one "Narrate" button that reads
// the whole chain aloud.
function SolutionPanel({ solution, hl }) {
    const steps = solution || [];
    const [narrating, setNarrating] = useState(false);
    if (!steps.length) return null;

    const playAll = () => {
        if (narrating) return;
        setNarrating(true);
        speakSequence(steps.map((s) => ({ t: s.say || s.t })), hl || "en", { finished: () => setNarrating(false) });
    };

    return (
        <div className="mt-6 max-w-md mx-auto text-left">
            <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] font-extrabold tracking-wider text-gray-400">WHY? HOW IT&apos;S SOLVED</p>
                <button
                    type="button"
                    onClick={playAll}
                    disabled={narrating}
                    className="flex items-center gap-1.5 text-[#1cb0f6] text-xs font-extrabold hover:text-[#1899d6] disabled:opacity-50"
                >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                    </svg>
                    {narrating ? "NARRATING…" : "NARRATE"}
                </button>
            </div>
            <div className="space-y-2">
                {steps.map((s, i) => (
                    <div key={i} className="flex items-center gap-3 rounded-2xl border-2 border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 p-3">
                        <span className="w-6 h-6 rounded-full bg-[#1cb0f6]/10 text-[#1cb0f6] text-[11px] font-extrabold flex items-center justify-center shrink-0">{i + 1}</span>
                        <p className="flex-1 text-sm font-bold text-gray-700 dark:text-gray-200 leading-snug">{s.t}</p>
                        {s.say && <SpeakBtn text={s.say} lang={hl || "en"} />}
                    </div>
                ))}
            </div>
        </div>
    );
}

// ── Typed answer (subjects) ───────────────────────────────────
// "Solve" exercises: type the answer, get it checked against accept[]
// (or a numeric tolerance), lose a heart on a miss, then reveal the fully
// narrated step-by-step solution.
function solveMatches(q, value) {
    const raw = (value || "").trim();
    if (!raw) return false;
    if (typeof q.tol === "number") {
        const n = parseFloat(raw);
        if (isNaN(n)) return false;
        return Math.abs(n - parseFloat(q.correct)) <= q.tol;
    }
    const norm = (s) => s.toLowerCase().replace(/[.,!?;:()]/g, "").replace(/\s+/g, " ").trim();
    const cleaned = norm(raw);
    return (q.accept || []).some((a) => norm(a) === cleaned);
}

function SolveCard({ q, hearts, hurt, onCheck }) {
    const [value, setValue] = useState("");
    const [checked, setChecked] = useState(false);
    const [correct, setCorrect] = useState(false);

    const numeric = (q.accept || []).length > 0 && (q.accept || []).every((a) => !isNaN(parseFloat(String(a))));
    const canSubmit = value.trim().length > 0;

    const check = () => {
        if (!canSubmit || checked) return;
        const ok = solveMatches(q, value);
        setChecked(true);
        setCorrect(ok);
        if (!ok) hurt(1);
    };

    return (
        <div className="flex flex-col min-h-[70vh]">
            <div className="flex-1 text-center">
                <p className="text-sm font-bold text-gray-400 dark:text-gray-500 mb-4">✏️ {q.prompt}</p>
                <input
                    type="text"
                    inputMode={numeric ? "numeric" : "text"}
                    autoFocus
                    value={value}
                    onChange={(e) => !checked && setValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") check(); }}
                    placeholder={numeric ? "Type your answer…" : "Type your answer…"}
                    disabled={checked}
                    className="w-full max-w-sm mx-auto block text-center text-xl font-extrabold py-4 rounded-2xl border-2 border-[#1cb0f6] bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 outline-none focus:border-[#1899d6] disabled:opacity-50"
                />
                {q.unit && <p className="text-sm font-bold text-gray-400 mt-1">{q.unit}</p>}

                {checked && (
                    <>
                        {!correct && (
                            <div className="max-w-sm mx-auto mt-4 rounded-2xl border-2 border-red-200 bg-red-500/5 p-3">
                                <p className="text-sm font-extrabold text-red-500">The answer is: {q.correct}</p>
                            </div>
                        )}
                        <SolutionPanel solution={q.solution} hl={q.hl || "en"} />
                    </>
                )}
            </div>

            <div className="sticky bottom-0 bg-white dark:bg-gray-950 border-t border-gray-100 dark:border-gray-800 mt-6">
                <div className="w-full max-w-2xl mx-auto px-4 py-4 flex items-center gap-4">
                    {checked && (
                        <span className={`text-2xl w-8 ${correct ? "text-[#58cc02]" : "text-red-500"}`}>{correct ? "✅" : `❤️ ${hearts}`}</span>
                    )}
                    <button
                        onClick={checked ? () => onCheck(correct) : check}
                        disabled={!checked && !canSubmit}
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
        </div>
    );
}

// ── Story time (5th lesson of even steps) ─────────────────────
// Listen to a short story, then answer comprehension questions.
function StoryCard({ q, rtl, hl, onCheck }) {
    const story = q.story || {};
    const sentences = story.sentences || [];
    const words = story.words || [];
    const [playing, setPlaying] = useState(false);

    const playAll = () => {
        setPlaying(true);
        speakSequence(sentences, hl, { finished: () => setPlaying(false) });
    };

    return (
        <div className="flex flex-col min-h-[70vh]">
            <div className="flex-1">
                <p className="text-center text-sm font-bold text-gray-400 dark:text-gray-500 mb-3">📖 {q.prompt}</p>
                <div className="max-w-lg mx-auto rounded-3xl overflow-hidden border-2 border-[#1cb0f6]">
                    <div className="bg-[#1cb0f6] text-white px-6 py-4 flex items-center justify-between">
                        <div className="font-extrabold text-lg leading-tight">{story.title}</div>
                        <button
                            onClick={playAll}
                            disabled={playing}
                            className="w-11 h-11 rounded-full bg-white text-[#1cb0f6] flex items-center justify-center shadow shrink-0"
                            aria-label="Play the whole story"
                        >
                            {playing ? (
                                <span className="w-5 h-5 rounded-full bg-[#1cb0f6] animate-pulse" />
                            ) : (
                                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M8 5v14l11-7z" />
                                </svg>
                            )}
                        </button>
                    </div>
                    <div className="bg-white dark:bg-gray-900 px-6 py-5 space-y-4">
                        {sentences.map((s, i) => (
                            <div key={i} className="flex items-center gap-3">
                                <span className="w-6 h-6 rounded-full bg-[#1cb0f6]/10 text-[#1cb0f6] text-[11px] font-extrabold flex items-center justify-center shrink-0">{i + 1}</span>
                                <div className="flex-1 min-w-0">
                                    <p className="text-lg font-extrabold text-gray-800 dark:text-gray-100 leading-snug" dir={rtl ? "rtl" : "ltr"}>{s.t}</p>
                                    {s.gloss && <Gloss text={s.gloss} />}
                                </div>
                                <SpeakBtn text={s.t} lang={hl} />
                            </div>
                        ))}
                    </div>
                </div>
                {words.length > 0 && (
                    <div className="max-w-lg mx-auto mt-4 flex flex-wrap items-center justify-center gap-2">
                        {words.map((w, i) => (
                            <button key={i} onClick={() => speakText(w.t, hl)} className="px-3 py-1.5 rounded-xl bg-gray-100 dark:bg-gray-800 text-sm font-bold text-gray-700 dark:text-gray-200 flex items-center gap-1.5 hover:bg-gray-200 dark:hover:bg-gray-700">
                                <span>{w.emoji}</span>
                                <span dir={rtl ? "rtl" : "ltr"}>{w.t}</span>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            <div className="sticky bottom-0 bg-white dark:bg-gray-950 border-t border-gray-100 dark:border-gray-800 mt-6">
                <div className="w-full max-w-2xl mx-auto px-4 py-4">
                    <button onClick={() => onCheck(true)} className="w-full py-3.5 rounded-2xl font-extrabold text-sm bg-[#1cb0f6] hover:bg-[#1899d6] text-white">
                        GOT IT — ANSWER THE QUESTIONS ▶
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── Speak up (5th lesson of odd steps) ────────────────────────
// Pronounce words (and, deeper in the course, whole sentences): the mic
// captures your voice, speech-to-text grades it against the expected phrase.
function PronounceCard({ q, rtl, hearts, hurt, onCheck }) {
    const items = q.items || [];
    const [idx, setIdx] = useState(0);
    const [results, setResults] = useState([]);
    const [sttBusy, setSttBusy] = useState(false);
    const [heard, setHeard] = useState("");
    const [source, setSource] = useState("");
    const finalizedRef = useRef(false);

    const item = items[Math.min(idx, items.length - 1)];
    const doneAll = results.length === items.length;
    const allOk = doneAll && results.every(Boolean);

    useEffect(() => {
        if (doneAll && !finalizedRef.current) {
            finalizedRef.current = true;
            onCheck(allOk);
        }
    }, [doneAll, allOk, onCheck]);

    const record = () => {
        if (sttBusy || !item) return;
        setSttBusy(true);
        setHeard("");
        setSource("");
        captureSpeech(item.t, q.hl, (r) => {
            setSttBusy(false);
            if (r && r.text) {
                setHeard(r.text);
                setSource(r.source === "native" ? "desktop" : "browser");
                const ok = speechMatch(r.text, item.t);
                setResults((rs) => [...rs, ok]);
                if (!ok) hurt(1);
            } else {
                // Speech recognition unavailable → self-check mode: the learner
                // pronounces it aloud and confirms. Keeps pronunciation lessons
                // usable on any device.
                setSource("self");
                setResults((rs) => [...rs, true]);
            }
        });
    };

    const nextItem = () => {
        if (idx + 1 < items.length) {
            setIdx(idx + 1);
            setHeard("");
            setSource("");
        }
    };

    return (
        <div className="flex flex-col min-h-[70vh]">
            <div className="flex-1 text-center">
                <p className="text-sm font-bold text-gray-400 dark:text-gray-500 mb-4">🗣️ {q.prompt}</p>

                <div className="flex items-center justify-center gap-2 mb-6">
                    {items.map((it, i) => {
                        const state = i < results.length ? (results[i] ? "ok" : "bad") : i === idx ? "now" : "later";
                        return (
                            <span key={i} className={`w-2.5 h-2.5 rounded-full ${state === "ok" ? "bg-[#58cc02]" : state === "bad" ? "bg-red-500" : state === "now" ? "bg-[#1cb0f6]" : "bg-gray-200 dark:bg-gray-700"}`} />
                        );
                    })}
                </div>

                {item && !doneAll && (
                    <>
                        <div className="inline-flex items-center justify-center gap-3 px-6 py-4 rounded-2xl bg-gray-50 dark:bg-gray-900 border-2 border-gray-100 dark:border-gray-800">
                            <span className="text-3xl">{item.emoji}</span>
                            <div className="text-left">
                                <p className="text-2xl font-extrabold text-gray-800 dark:text-gray-100 leading-snug" dir={rtl ? "rtl" : "ltr"}>{item.t}</p>
                                {item.gloss && <Gloss text={item.gloss} />}
                            </div>
                            <SpeakBtn text={item.t} lang={q.hl} />
                        </div>
                        <p className="text-xs text-gray-400 mt-3 mb-5">Say it aloud — we&apos;ll listen and check it.</p>

                        <div className="flex flex-col items-center gap-3">
                            <button
                                onClick={record}
                                disabled={sttBusy}
                                className={`w-24 h-24 rounded-full flex items-center justify-center shadow-lg transition-colors text-white ${sttBusy ? "bg-red-500 animate-pulse" : "bg-[#1cb0f6] hover:bg-[#1899d6]"}`}
                                aria-label="Record pronunciation"
                            >
                                {sttBusy ? (
                                    <span className="w-10 h-10 rounded-full bg-white/25 animate-ping" />
                                ) : (
                                    <svg className="w-9 h-9" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3z" />
                                        <path d="M17 11a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z" />
                                    </svg>
                                )}
                            </button>
                            <p className="text-xs font-bold text-gray-400">
                                {sttBusy ? "Listening…" : heard ? (source === "self" ? "Said it yourself — nice! ✓" : `Heard: “${heard}”`) : "Tap the mic & speak"}
                            </p>
                            {heard && (
                                <button onClick={nextItem} className="mt-1 w-full max-w-xs py-3 rounded-2xl bg-[#58cc02] text-white font-extrabold text-sm hover:bg-[#46a302]">
                                    {source === "self" ? "I SAID IT — NEXT →" : "NEXT →"}
                                </button>
                            )}
                        </div>
                    </>
                )}

                {doneAll && (
                    <div className="py-10">
                        <span className="text-5xl block mb-3">{allOk ? "🎉" : "💪"}</span>
                        <p className="font-extrabold text-xl text-gray-800 dark:text-gray-100">{allOk ? "Amazing pronunciation!" : "Nice try — keep practicing!"}</p>
                        <p className="text-sm text-gray-400 mt-1">{results.filter(Boolean).length}/{items.length} pronounced correctly.</p>
                    </div>
                )}
            </div>
        </div>
    );
}

function qPromptDir(q, rtl) {
    // "Which of these…" options are target-language content → mirror for RTL scripts.
    // "What does…" options are English → always LTR.
    if (q.type === "select" && (q.prompt || "").startsWith("Which of these") && rtl) return "rtl";
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