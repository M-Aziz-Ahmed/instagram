"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";

const LEAGUE_TIERS = ["Bronze", "Silver", "Gold", "Sapphire", "Ruby", "Emerald", "Amethyst", "Pearl", "Obsidian", "Diamond"];
const OFFSETS = [0, 90, 150, 90, 0, -90, -150, -90];

function Heart({ filled }) {
    return (
        <svg className={`w-6 h-6 transition-all ${filled ? "text-red-500 scale-100" : "text-gray-300 dark:text-gray-700 scale-75"}`} viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 21s-6.7-4.35-9.33-8.11C.9 10.13 1.74 6.59 4.5 5.5c2.2-.87 4.44.15 5.5 2.09 1.06-1.94 3.3-2.96 5.5-2.09 2.76 1.09 3.6 4.63 1.83 7.39C18.7 16.65 12 21 12 21z" />
        </svg>
    );
}

function LeagueBox({ tier, tierName, onClick }) {
    const colors = ["#ff9600", "#c0c0c0", "#ffd700", "#1cb0f6", "#ce82ff", "#6fbf43", "#9370db", "#8c8c9a", "#0f172a", "#4b5563"];
    return (
        <button onClick={onClick} className="flex items-center gap-2">
            <span className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-extrabold text-lg shadow-sm" style={{ backgroundColor: colors[tier] || "#3b82f6" }}>
                {Math.max(1, Math.min(10, tier + 1))}
            </span>
            <span className="text-left leading-tight">
                <span className="block text-[10px] font-bold text-gray-400 dark:text-gray-500">{tierName}</span>
                <span className="block text-[10px] font-bold text-gray-500 dark:text-gray-400">LEAGUE</span>
            </span>
        </button>
    );
}

export default function CourseShell() {
    const { courseId } = useParams();
    const router = useRouter();
    const [me, setMe] = useState(null);
    const [course, setCourse] = useState(null);
    const [league, setLeague] = useState(null);
    const [leaders, setLeaders] = useState(null);
    const [friends, setFriends] = useState([]);
    const [tab, setTab] = useState("learn");
    const [loading, setLoading] = useState(true);
    const [shopOpen, setShopOpen] = useState(false);
    const [profileOpen, setProfileOpen] = useState(false);
    const [toast, setToast] = useState(null);
    const toastTimer = useRef(null);

    const notify = useCallback((msg) => {
        setToast(msg);
        clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => setToast(null), 2600);
    }, []);

    const refreshMe = useCallback(async () => {
        try {
            const r = await fetch(`/api/learn/me`, { credentials: "include" });
            if (r.ok) setMe((await r.json()));
        } catch {}
    }, []);

    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const [d, lg, ld, fr] = await Promise.all([
                    fetch(`/api/learn/course/${courseId}`, { credentials: "include" }).then((r) => r.json()),
                    fetch(`/api/learn/league`, { credentials: "include" }).then((r) => r.json()),
                    fetch(`/api/learn/leaderboard`, { credentials: "include" }).then((r) => r.json()),
                    fetch(`/api/learn/friends`, { credentials: "include" }).then((r) => r.json()),
                ]);
                if (!alive) return;
                setMe(d.me);
                setCourse(d.course);
                setLeague(lg.league);
                setLeaders(ld);
                setFriends(fr.friends || []);
            } catch {}
            setLoading(false);
        })();
        return () => { alive = false; };
    }, [courseId]);

    const startLesson = (lesson) => {
        router.push(`/education/lesson/${courseId}/${lesson.id}`);
    };

    const refreshLeague = async () => {
        const r = await fetch("/api/learn/league", { credentials: "include" });
        if (r.ok) setLeague((await r.json()).league);
    };

    return (
        <div className="min-h-screen bg-white dark:bg-gray-950 pb-28">
            {/* Top bar */}
            <div className="sticky top-0 z-20 bg-white dark:bg-gray-950 border-b border-gray-100 dark:border-gray-800">
                <div className="max-w-3xl mx-auto px-4 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Link href="/education" aria-label="Back" className="p-1.5 -ml-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg">
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                            </svg>
                        </Link>
                        <LeagueBox tier={me?.league?.tier ?? 0} tierName={LEAGUE_TIERS[me?.league?.tier ?? 0]} onClick={() => setTab("league")} />
                    </div>
                    <div className="flex items-center gap-4">
                        <button onClick={() => setTab("league")} className="flex items-center gap-1" aria-label="League placement">
                            <span className="w-9 h-9 rounded-lg flex items-center justify-center text-[#1cb0f6] dark:text-[#84d8ff] font-bold text-lg bg-[#ddf4ff] dark:bg-[#062c3a]">ⓘ</span>
                            <span className="text-left leading-tight hidden sm:block">
                                <span className="block text-[9px] font-bold text-gray-400">PLACEMENT</span>
                                <span className="block text-[9px] font-bold text-gray-500 dark:text-gray-400">TRY IT</span>
                            </span>
                        </button>
                        <button onClick={() => setTab("league")} className="flex items-center gap-1" aria-label="Streak">
                            <span className="text-xl">🔥</span>
                            <span className="font-extrabold text-gray-800 dark:text-gray-100">{me?.streak || 0}</span>
                        </button>
                        <button onClick={() => setShopOpen(true)} className="flex items-center gap-1" aria-label="Diamonds">
                            <span className="text-xl">💎</span>
                            <span className="font-extrabold text-gray-800 dark:text-gray-100">{me?.gems || 0}</span>
                        </button>
                        <button onClick={() => setTab("profile")} aria-label="Profile" className="w-9 h-9 rounded-full overflow-hidden ring-2 ring-gray-200 dark:ring-gray-700 shrink-0">
                            {me?.avatarUrl ? (
                                <img src={me.avatarUrl} alt="" className="w-full h-full object-cover" />
                            ) : (
                                <span className="w-full h-full flex items-center justify-center text-white text-sm font-bold" style={{ backgroundColor: me?.avatarColor || "#3b82f6" }}>
                                    {me?.username?.[0]?.toUpperCase()}
                                </span>
                            )}
                        </button>
                    </div>
                </div>
            </div>

            {loading ? (
                <div className="flex justify-center py-20">
                    <div className="w-8 h-8 border-2 border-gray-300 dark:border-gray-700 border-t-[#58cc02] rounded-full animate-spin" />
                </div>
            ) : (
                <div className="max-w-3xl mx-auto">
                    {tab === "learn" && (
                        <LearningPath course={course} me={me} startLesson={startLesson} openQuests={() => setTab("quests")} openLeague={() => setTab("league")} />
                    )}
                    {tab === "quests" && <QuestsPanel me={me} refreshMe={refreshMe} notify={notify} />}
                    {tab === "league" && <LeaguePanel league={league} me={me} refreshLeague={refreshLeague} leaders={leaders} />}
                    {tab === "shop" && <ShopPanel me={me} friends={friends} refreshMe={refreshMe} notify={notify} refreshLeague={refreshLeague} />}
                    {tab === "profile" && <ProfilePanel me={me} friends={friends} notify={notify} onShowShop={() => setShopOpen(true)} />}
                </div>
            )}

            {/* Bottom nav (Duolingo style) */}
            <div className="fixed bottom-0 left-0 right-0 z-30 bg-white dark:bg-gray-950 border-t border-gray-200 dark:border-gray-800 safe-bottom">
                <div className="max-w-3xl mx-auto flex items-stretch h-16 px-2">
                    {[
                        { id: "learn", label: "LEARN", icon: "🌳" },
                        { id: "quests", label: "QUESTS", icon: "🎯" },
                        { id: "league", label: "LEAGUE", icon: "🏆" },
                        { id: "shop", label: "SHOP", icon: "🛒" },
                        { id: "profile", label: "PROFILE", icon: "🙂" },
                    ].map((t) => {
                        const active = tab === t.id;
                        return (
                            <button key={t.id} onClick={() => setTab(t.id)} className={`flex-1 flex flex-col items-center justify-center gap-1 rounded-xl transition-colors ${active ? "text-[#58cc02] bg-[#58cc02]/10" : "text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-900"}`}>
                                <span className="text-xl leading-none">{t.icon}</span>
                                <span className="text-[9px] font-extrabold tracking-wide">{t.label}</span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Shop modal */}
            {shopOpen && (
                <ShopModal me={me} friends={friends} onClose={() => setShopOpen(false)} refreshMe={refreshMe} notify={notify} onOpenLeague={() => { setShopOpen(false); setTab("league"); }} />
            )}

            {toast && (
                <div className="fixed left-1/2 -translate-x-1/2 bottom-24 z-40 bg-gray-900 text-white text-sm font-bold px-5 py-3 rounded-2xl shadow-xl">
                    {toast}
                </div>
            )}
        </div>
    );
}

// ── Learning Path ─────────────────────────────────────────────
function LearningPath({ course, me, startLesson, openQuests, openLeague }) {
    if (!course) return null;
    const { meta, units } = course;

    const allDone = units.every((u) => u.lessons.every((l) => l.done));

    return (
        <div className="relative">
            {/* Daily quest strip */}
            <div className="px-4 pt-4">
                <button onClick={openQuests} className="w-full flex items-center gap-3 bg-[#fff4e0] dark:bg-[#2a2313] border-2 border-[#ffc800] rounded-2xl p-3">
                    <span className="w-10 h-10 rounded-full bg-[#ffc800] flex items-center justify-center text-xl">🎯</span>
                    <span className="flex-1 text-left leading-tight">
                        <span className="block text-[10px] font-extrabold text-gray-500 dark:text-gray-400">DAILY QUESTS</span>
                        <span className="block text-xs font-extrabold text-gray-800 dark:text-gray-100">
                            {me?.quests?.filter((q) => q.done).length || 0}/{me?.quests?.length || 3} completed
                        </span>
                    </span>
                    <span className="text-[#58cc02] font-extrabold text-sm">→</span>
                </button>
            </div>

            {/* Start header */}
            <div className="px-4 pt-4 pb-2 text-center">
                <span className="text-4xl block">{meta.flag}</span>
                <h1 className="font-extrabold text-xl text-gray-800 dark:text-gray-100 mt-1">
                    {allDone ? "Course complete! 🎉" : `Learn ${meta.name}`}
                </h1>
                <p className="text-xs text-gray-400 max-w-sm mx-auto mt-1 leading-relaxed">
                    {meta.rtl ? "You'll read right-to-left in this course." : "Follow the path below, one lesson at a time."}
                </p>
            </div>

            {/* Units + nodes */}
            {units.map((unit, ui) => (
                <div key={unit.id} className="pt-4">
                    <div className="px-4 py-6 text-center bg-white dark:bg-gray-900 mx-4 rounded-2xl border-2 border-gray-100 dark:border-gray-800 shadow-sm" style={{ borderTop: `6px solid ${unit.color}` }}>
                        <p className="text-[10px] font-extrabold tracking-[0.2em] text-gray-400">UNIT {ui + 1}</p>
                        <p className="font-extrabold text-lg text-gray-800 dark:text-gray-100" style={{ color: unit.color }}>
                            {unit.title.toUpperCase()}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">{unit.lessons.filter((l) => l.done).length}/{unit.lessons.length} lessons · {unit.lessons.filter((l) => l.done).length === unit.lessons.length ? "Unit cleared ✓" : "Keep going!"}</p>
                    </div>

                    <div className="pt-2">
                        {unit.lessons.map((lesson, li) => {
                            const offset = OFFSETS[li % OFFSETS.length];
                            return (
                                <div key={lesson.id} className="relative">
                                    {li > 0 && <div className="w-0.5 h-12 bg-gray-200 dark:bg-gray-700" style={{ marginLeft: `calc(50% + ${(offset + OFFSETS[(li - 1) % OFFSETS.length]) / 4}px)` }} />}
                                    <div className="flex justify-center px-4 py-1" style={{ transform: `translateX(${offset}px)` }}>
                                        <LessonNode lesson={lesson} color={unit.color} onOpen={() => startLesson(lesson)} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            ))}

            {/* Bottom streak banner */}
            <div className="px-4 py-8">
                <button onClick={openLeague} className="w-full bg-[#ddf4ff] dark:bg-[#062c3a] rounded-2xl p-5 text-center">
                    <span className="text-3xl">🏆</span>
                    <p className="font-extrabold text-[#1cb0f6] dark:text-[#84d8ff] mt-1">You&apos;re in the {LEAGUE_TIERS[me?.league?.tier ?? 0]} League</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Compete for the top 3 and get promoted!</p>
                </button>
            </div>
        </div>
    );
}

function LessonNode({ lesson, color, onOpen }) {
    return (
        <button
            onClick={onOpen}
            disabled={lesson.locked}
            aria-label={lesson.title}
            className={`relative w-14 h-14 rounded-full flex items-center justify-center text-2xl font-extrabold border-4 transition-transform active:scale-95 ${
                lesson.done
                    ? "border-white dark:border-gray-950 ring-2 text-white"
                    : lesson.locked
                    ? "border-gray-300 dark:border-gray-700 bg-gray-200 dark:bg-gray-800 text-gray-400 cursor-not-allowed"
                    : "border-white dark:border-gray-950 ring-4 bg-[#58cc02] text-white animate-[pulse_2s_ease-in-out_infinite]"
            }`}
            style={lesson.done ? { backgroundColor: color, boxShadow: `0 0 0 1px ${color}55` } : lesson.locked ? {} : {}}
        >
            {lesson.locked ? (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
                </svg>
            ) : lesson.done ? (
                <span>★</span>
            ) : (
                <span className="text-white">▶</span>
            )}
        </button>
    );
}

// ── Quests ────────────────────────────────────────────────────
function QuestsPanel({ me, refreshMe, notify }) {
    const claim = async (id) => {
        const r = await fetch("/api/learn/quests/claim", {
            method: "POST", credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ questId: id }),
        });
        const d = await r.json();
        if (r.ok) notify("+10 💎 claimed!");
        else notify(d.error || "Claim failed");
        refreshMe();
    };
    const list = me?.quests || [];
    const claimedAll = list.length > 0 && list.every((q) => q.claimed || !q.done);

    return (
        <div className="px-4 pt-6 max-w-xl mx-auto space-y-3 pb-10">
            <h2 className="font-extrabold text-lg text-gray-800 dark:text-gray-100">Daily Quests 🎯</h2>
            <p className="text-xs text-gray-400 -mt-2">Complete quests to earn diamonds.</p>
            {list.map((q) => (
                <div key={q.id} className={`bg-white dark:bg-gray-900 border-2 rounded-2xl p-4 ${q.done ? "border-[#58cc02]" : "border-gray-200 dark:border-gray-800"}`}>
                    <div className="flex items-center gap-3">
                        <span className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl ${q.done ? "bg-[#58cc02]/15" : "bg-gray-100 dark:bg-gray-800"}`}>
                            {q.done ? "✅" : q.target === "xp" ? "⚡" : q.target === "lessons" ? "🛡️" : q.target === "perfect" ? "💯" : "💬"}
                        </span>
                        <div className="flex-1 min-w-0">
                            <p className="font-bold text-sm text-gray-800 dark:text-gray-100">{q.desc}</p>
                            <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-800 mt-2 overflow-hidden">
                                <div className="h-full bg-[#58cc02] rounded-full transition-all" style={{ width: `${Math.min(100, (q.progress / q.goal) * 100)}%` }} />
                            </div>
                            <p className="text-[11px] text-gray-400 mt-1">{Math.min(q.progress, q.goal)}/{q.goal}</p>
                        </div>
                        {q.done && (
                            <button onClick={() => claim(q.id)} disabled={q.claimed}
                                className={`shrink-0 px-4 py-2 rounded-xl text-sm font-extrabold ${q.claimed ? "bg-gray-100 dark:bg-gray-800 text-gray-400" : "bg-[#ffc800] text-gray-900 hover:bg-yellow-500"}`}>
                                {q.claimed ? "Claimed ✓" : `+10 💎`}
                            </button>
                        )}
                    </div>
                </div>
            ))}
            {claimedAll && (
                <div className="bg-[#ffc800]/15 border-2 border-[#ffc800] rounded-2xl p-4 text-center">
                    <p className="text-sm font-extrabold text-gray-800 dark:text-gray-100">All quests done! 🎉</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Come back tomorrow for a new set.</p>
                </div>
            )}
        </div>
    );
}

// ── League ────────────────────────────────────────────────────
function LeaguePanel({ league, me, refreshLeague, leaders }) {
    const [view, setView] = useState("league"); // league | world
    const standings = league?.standings || [];
    const remaining = league?.remainingMs || 0;
    const days = Math.floor(remaining / 86400000);
    const hrs = Math.floor((remaining % 86400000) / 3600000);
    const fmt = days > 0 ? `${days}D ${hrs}H` : `${hrs}H ${Math.floor((remaining % 3600000) / 60000)}M`;

    return (
        <div className="px-4 pt-6 max-w-xl mx-auto pb-10">
            {/* Segmented control */}
            <div className="flex bg-gray-100 dark:bg-gray-800 rounded-2xl p-1 mb-5">
                {[
                    { id: "league", label: `🏆 My League${league?.tierName ? ` · ${league.tierName}` : ""}` },
                    { id: "world", label: "🌍 World" },
                ].map((v) => (
                    <button key={v.id} onClick={() => setView(v.id)} className={`flex-1 py-2.5 rounded-xl text-xs font-extrabold transition-colors ${view === v.id ? "bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 shadow-sm" : "text-gray-400 hover:text-gray-600"}`}>
                        {v.label}
                    </button>
                ))}
            </div>

            {view === "world" ? (
                <LeadersPanel data={leaders} me={me} />
            ) : (
                <>
                    <div className="flex items-center justify-between mb-1">
                        <h2 className="font-extrabold text-lg text-gray-800 dark:text-gray-100">{league?.tierName} League</h2>
                        <span className="text-xs font-bold text-gray-400">⏳ {fmt} left</span>
                    </div>
                    <p className="text-xs text-gray-400 mb-4">
                        Top 3 move up · bottom 3 move down. Winner gets up to 100 💎.
                    </p>

                    {league?.lastSeason?.season && (
                        <div className="bg-[#ddf4ff] dark:bg-[#062c3a] border border-[#1cb0f6]/30 rounded-2xl p-3 mb-4 text-sm">
                            <span className="text-[#1cb0f6] dark:text-[#84d8ff] font-extrabold">
                                Last week: #{league.lastSeason.rank} in {LEAGUE_TIERS[league.lastSeason.tier]} —{" "}
                                {league.lastSeason.rank <= 3 ? "Promoted 🎉" : standings.length - league.lastSeason.rank < 3 ? "Sent down 😬" : league.lastSeason.rank === 1 ? "Winner 👑" : "Stayed put"}
                            </span>
                        </div>
                    )}

                    {standings.length === 0 ? (
                        <div className="text-center py-12 text-gray-400 text-sm">
                            No learners in this league yet. Complete a lesson to join!
                        </div>
                    ) : (
                        <div className="space-y-1.5">
                            {standings.map((m, i) => {
                                const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : null;
                                const isMe = m.you;
                                return (
                                    <div key={m.username} className={`flex items-center gap-3 p-2.5 rounded-2xl ${isMe ? "bg-[#58cc02]/10 border-2 border-[#58cc02]" : "bg-white dark:bg-gray-900 border-2 border-gray-100 dark:border-gray-800"}`}>
                                        <span className="w-8 text-center font-extrabold text-sm text-gray-400">{medal || `#${i + 1}`}</span>
                                        <span className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center text-white text-xs font-bold shrink-0" style={{ backgroundColor: m.avatarColor || "#3b82f6" }}>
                                            {m.avatarUrl ? <img src={m.avatarUrl} alt="" className="w-full h-full object-cover" /> : m.username?.[0]?.toUpperCase()}
                                        </span>
                                        <span className="flex-1 min-w-0 font-bold text-sm truncate text-gray-800 dark:text-gray-100">
                                            {m.username}{isMe && <span className="ml-1 text-[10px] text-[#58cc02]">(you)</span>}
                                        </span>
                                        <span className="font-extrabold text-sm text-gray-700 dark:text-gray-200">{m.xp} XP</span>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    <button onClick={refreshLeague} className="mt-4 w-full py-3 rounded-2xl border-2 border-gray-200 dark:border-gray-700 text-sm font-extrabold text-gray-500 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900">
                        ↺ Refresh
                    </button>
                </>
            )}
        </div>
    );
}

// ── Global leaders ────────────────────────────────────────────
function LeadersPanel({ data, me }) {
    const rows = data?.leaderboard || [];
    return (
        <div className="px-4 pt-6 max-w-xl mx-auto pb-10">
            <h2 className="font-extrabold text-lg text-gray-800 dark:text-gray-100">Top Learners 🌍</h2>
            <p className="text-xs text-gray-400 mb-4">The best language learners on AnonTweet, all-time XP.</p>
            <div className="space-y-1.5">
                {rows.map((r, i) => (
                    <div key={r.username} className={`flex items-center gap-3 p-2.5 rounded-2xl ${r.you ? "bg-[#58cc02]/10 border-2 border-[#58cc02]" : "bg-white dark:bg-gray-900 border-2 border-gray-100 dark:border-gray-800"}`}>
                        <span className="w-8 text-center font-extrabold text-sm text-gray-400">{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}</span>
                        <span className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center text-white text-xs font-bold shrink-0" style={{ backgroundColor: r.avatarColor || "#3b82f6" }}>
                            {r.avatarUrl ? <img src={r.avatarUrl} alt="" className="w-full h-full object-cover" /> : r.username?.[0]?.toUpperCase()}
                        </span>
                        <span className="flex-1 min-w-0 truncate">
                            <span className="font-bold text-sm text-gray-800 dark:text-gray-100">{r.username}{r.you && ` (you)`}</span>
                            <span className="block text-[11px] text-gray-400">🔥 {r.streak}d · ⚡ {r.xp} XP</span>
                        </span>
                        <span className="font-extrabold text-sm text-gray-700 dark:text-gray-200">{r.xp.toLocaleString()} XP</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ── Shop tab ──────────────────────────────────────────────────
function ShopPanel({ me, friends, refreshMe, notify, refreshLeague }) {
    const [friend, setFriend] = useState("");
    const act = async (item, extra) => {
        const r = await fetch("/api/learn/shop/buy", {
            method: "POST", credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ item, ...extra }),
        });
        const d = await r.json();
        if (d.me) refreshMe();
        if (r.ok) notify("✅ Done!");
        else notify(d.error || "Something went wrong");
    };

    const items = [
        { id: "streak_freeze", name: "Streak Freeze", emoji: "🧊", cost: 200, desc: "Protects your streak for one missed day. Max 2.", owned: me?.streakFreezes },
        { id: "streak_repair", name: "Streak Repair", emoji: "🛠️", cost: 50, desc: "Bring back a broken streak (within 3 days).", disabled: !me?.streakBrokenAt },
        { id: "hearts", name: "Hearts Refill", emoji: "❤️", cost: 150, desc: "Refill all 5 hearts instantly.", disabled: (me?.hearts ?? 5) >= 5 },
    ];

    return (
        <div className="px-4 pt-6 max-w-xl mx-auto pb-10">
            <h2 className="font-extrabold text-lg text-gray-800 dark:text-gray-100">Diamond Shop 💎</h2>
            <p className="text-xs text-gray-400 mb-4">You have {me?.gems || 0} diamonds.</p>

            <div className="space-y-3">
                {items.map((it) => (
                    <div key={it.id} className="bg-white dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-800 rounded-2xl p-4 flex items-center gap-3">
                        <span className="text-3xl">{it.emoji}</span>
                        <div className="flex-1 min-w-0">
                            <p className="font-bold text-sm text-gray-800 dark:text-gray-100">{it.name}{it.owned > 0 && <span className="ml-1 text-xs text-[#1cb0f6]">x{it.owned}</span>}</p>
                            <p className="text-xs text-gray-400">{it.desc}</p>
                        </div>
                        <button
                            onClick={() => it.id === "hearts" ? act("hearts", {}) : act(it.id, {})}
                            disabled={it.disabled || (me?.gems || 0) < it.cost}
                            className="shrink-0 px-3 py-2 rounded-xl bg-[#58cc02] disabled:bg-gray-200 dark:disabled:bg-gray-800 disabled:text-gray-400 text-white text-sm font-extrabold hover:bg-[#46a302]"
                        >
                            {it.cost} 💎
                        </button>
                    </div>
                ))}
            </div>

            {/* Social actions */}
            <h3 className="font-extrabold text-base text-gray-800 dark:text-gray-100 mt-8 mb-2">Friends &amp; Comebacks 🤝</h3>
            <div className="bg-white dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-800 rounded-2xl p-4">
                {friends.length === 0 && <p className="text-sm text-gray-400 py-2">Follow some friends to send them a come back request or a tip.</p>}
                {friends.length > 0 && (
                    <>
                        <select
                            value={friend}
                            onChange={(e) => setFriend(e.target.value)}
                            className="w-full mb-3 px-3 py-2.5 rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm font-medium text-gray-800 dark:text-gray-100"
                        >
                            <option value="">Choose a friend…</option>
                            {friends.filter((f) => f.username !== me?.username).map((f) => (
                                <option key={f.username} value={f.username}>@{f.username} {f.streak > 0 ? `🔥${f.streak}` : `⚡${f.xp}`}</option>
                            ))}
                        </select>
                        <div className="flex gap-2">
                            <button onClick={() => friend && act("comeback", { friend })} disabled={!friend}
                                className="flex-1 py-2.5 rounded-xl bg-[#1cb0f6] text-white text-sm font-extrabold disabled:bg-gray-200 dark:disabled:bg-gray-800 disabled:text-gray-400 hover:bg-[#1899d6]">
                                🛎️ Ask to come back
                            </button>
                            <button onClick={() => friend && act("tip_friend", { friend })} disabled={!friend || (me?.gems || 0) < 100}
                                className="flex-1 py-2.5 rounded-xl bg-[#ffc800] text-gray-900 text-sm font-extrabold disabled:bg-gray-200 dark:disabled:bg-gray-800 disabled:text-gray-400 hover:bg-yellow-500">
                                💸 Tip +50 💎 (100)
                            </button>
                        </div>
                        <p className="text-[11px] text-gray-400 mt-2">When your friend completes a lesson after your invite, you both earn bonuses.</p>
                    </>
                )}
            </div>
        </div>
    );
}

// ── Profile tab ───────────────────────────────────────────────
const BADGES = {
    first_lesson: "🌱", streak_3: "🔥", streak_7: "⚡", streak_30: "🐉", streak_100: "👑",
    perfect_5: "💯", perfect_20: "✨", xp_500: "⭐", xp_2000: "🚀", xp_10000: "🏆",
    league_join: "🥊", league_promo: "🎖️", gems_500: "💎", gems_2000: "💰", words_100: "📚",
};

function ProfilePanel({ me, friends, notify, onShowShop }) {
    const [goalMenu, setGoalMenu] = useState(false);
    const [goalMe, setGoalMe] = useState(me);
    const current = goalMe || me;
    const changeGoal = async (g) => {
        const r = await fetch("/api/learn/goal", {
            method: "POST", credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ goal: g }),
        });
        const d = await r.json();
        if (d.me) setGoalMe(d.me);
        setGoalMenu(false);
        notify("Daily goal updated! ✅");
    };
    const pct = Math.min(100, ((current?.dailyXp || 0) / (current?.dailyGoal || 20)) * 100);

    return (
        <div className="px-4 pt-6 max-w-xl mx-auto pb-10">
            <div className="flex items-center gap-4 bg-white dark:bg-gray-900 border-2 border-gray-100 dark:border-gray-800 rounded-2xl p-4">
                <span className="w-16 h-16 rounded-full overflow-hidden flex items-center justify-center text-white text-2xl font-extrabold shrink-0" style={{ backgroundColor: current?.avatarColor || "#3b82f6" }}>
                    {current?.avatarUrl ? <img src={current.avatarUrl} alt="" className="w-full h-full object-cover" /> : current?.username?.[0]?.toUpperCase()}
                </span>
                <div className="flex-1 min-w-0">
                    <p className="font-extrabold text-lg text-gray-800 dark:text-gray-100">@{current?.username}</p>
                    <p className="text-xs text-gray-400">Level {current?.level} · {current?.totalCorrect || 0} correct answers</p>
                    <div className="h-2.5 rounded-full bg-gray-100 dark:bg-gray-800 mt-2 overflow-hidden">
                        <div className="h-full bg-[#ffc800] rounded-full" style={{ width: `${Math.round((current?.levelPct || 0) * 100)}%` }} />
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1">{Math.round(current?.levelCurrent || 0)}/{Math.round(current?.levelNeeded || 0)} XP to level {current?.level + 1}</p>
                </div>
            </div>

            <div className="grid grid-cols-3 gap-3 my-4">
                <div className="bg-white dark:bg-gray-900 border-2 border-gray-100 dark:border-gray-800 rounded-2xl p-3 text-center">
                    <span className="block text-2xl">🔥</span>
                    <span className="font-extrabold text-lg text-gray-800 dark:text-gray-100">{current?.streak}</span>
                    <span className="block text-[10px] font-bold text-gray-400">DAY STREAK</span>
                </div>
                <div className="bg-white dark:bg-gray-900 border-2 border-gray-100 dark:border-gray-800 rounded-2xl p-3 text-center">
                    <span className="block text-2xl">⚡</span>
                    <span className="font-extrabold text-lg text-gray-800 dark:text-gray-100">{current?.xp}</span>
                    <span className="block text-[10px] font-bold text-gray-400">TOTAL XP</span>
                </div>
                <div className="bg-white dark:bg-gray-900 border-2 border-gray-100 dark:border-gray-800 rounded-2xl p-3 text-center">
                    <span className="block text-2xl">💎</span>
                    <span className="font-extrabold text-lg text-gray-800 dark:text-gray-100">{current?.gems}</span>
                    <span className="block text-[10px] font-bold text-gray-400">DIAMONDS</span>
                </div>
            </div>

            {/* Daily goal */}
            <div className="bg-white dark:bg-gray-900 border-2 border-gray-100 dark:border-gray-800 rounded-2xl p-4 mb-4">
                <div className="flex items-center justify-between">
                    <p className="font-extrabold text-sm text-gray-800 dark:text-gray-100">Daily goal: {current?.dailyXp || 0}/{current?.dailyGoal} XP</p>
                    <div className="relative">
                        <button onClick={() => setGoalMenu(!goalMenu)} className="text-xs font-bold text-[#1cb0f6] hover:underline">Change</button>
                        {goalMenu && (
                            <div className="absolute right-0 top-6 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg overflow-hidden z-10">
                                {[10, 20, 30, 40, 50].map((g) => (
                                    <button key={g} onClick={() => changeGoal(g)} className="block w-full px-5 py-2 text-left text-sm font-bold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700">
                                        {g} XP {g === 20 && "· default"}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
                <div className="h-3 rounded-full bg-gray-100 dark:bg-gray-800 mt-2 overflow-hidden">
                    <div className={`h-full rounded-full ${pct >= 100 ? "bg-[#ffc800]" : "bg-[#58cc02]"}`} style={{ width: `${pct}%` }} />
                </div>
            </div>

            {/* Comeback box */}
            <div className="bg-[#ffddf4] dark:bg-[#381426] border border-[#ce82ff]/40 rounded-2xl p-4 mb-4">
                <p className="font-extrabold text-sm text-gray-800 dark:text-gray-100">👋 Friends in your league</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {friends.filter((f) => f.playing).length || 0} of your friends are learning. Compare streaks in the league tab!
                </p>
            </div>

            {/* Achievements */}
            <p className="font-extrabold text-sm text-gray-800 dark:text-gray-100 mb-2">Achievements</p>
            <div className="grid grid-cols-5 gap-2 mb-6">
                {Object.entries(BADGES).map(([id, icon]) => {
                    const earned = (current?.achievements || []).includes(id);
                    return (
                        <div key={id} title={id} className={`aspect-square rounded-xl flex items-center justify-center text-2xl border-2 ${earned ? "bg-[#ffc800]/20 border-[#ffc800]" : "bg-gray-100 dark:bg-gray-800 border-gray-100 dark:border-gray-800 grayscale opacity-40"}`}>
                            {icon}
                        </div>
                    );
                })}
            </div>

            <button onClick={onShowShop} className="w-full py-3 rounded-2xl bg-[#ffc800] text-gray-900 text-sm font-extrabold hover:bg-yellow-500">
                🛍️ Open the Diamond Shop
            </button>
        </div>
    );
}

// ── Shop modal ────────────────────────────────────────────────
function ShopModal({ me, friends, onClose, refreshMe, notify }) {
    const [gotIt, setGotIt] = useState(false);
    const buy = async (item, extra) => {
        const r = await fetch("/api/learn/shop/buy", {
            method: "POST", credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ item, ...extra }),
        });
        const d = await r.json();
        if (d.me) refreshMe();
        if (!r.ok) notify(d.error || "Purchase failed");
    };
    return (
        <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/60" onClick={onClose}>
            <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-t-3xl sm:rounded-3xl p-6 pb-10" onClick={(e) => e.stopPropagation()}>
                <div className="w-10 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full mx-auto mb-4 sm:hidden" />
                <div className="flex items-center justify-between mb-4">
                    <h3 className="font-extrabold text-lg text-gray-800 dark:text-gray-100">Diamond Shop 💎</h3>
                    <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg">✕</button>
                </div>

                {!gotIt ? (
                    <div className="text-center py-4">
                        <span className="text-5xl block">💎</span>
                        <p className="font-extrabold text-xl text-gray-800 dark:text-gray-100 mt-3">Spend diamonds</p>
                        <p className="text-sm text-gray-400 mt-1 max-w-xs mx-auto">
                            Earn diamonds in lessons and quests, then spend them on streak freezes, repairs, tips and more.
                        </p>
                        <button onClick={() => setGotIt(true)} className="mt-6 w-full py-3 rounded-2xl bg-[#58cc02] text-white font-extrabold hover:bg-[#46a302]">
                            Let&apos;s go!
                        </button>
                    </div>
                ) : (
                    <div className="space-y-2">
                        <button onClick={() => buy("streak_freeze")} disabled={(me?.gems || 0) < 200} className="w-full flex items-center gap-3 bg-gray-50 dark:bg-gray-800 rounded-2xl p-3 disabled:opacity-50">
                            <span className="text-2xl">🧊</span>
                            <span className="flex-1 text-left"><span className="block font-bold text-sm text-gray-800 dark:text-gray-100">Streak Freeze</span><span className="block text-[11px] text-gray-400">Keep your streak safe. Owned: {me?.streakFreezes}/2</span></span>
                            <span className="font-extrabold text-sm">200 💎</span>
                        </button>
                        <button onClick={() => buy("hearts")} disabled={(me?.gems || 0) < 150 || (me?.hearts ?? 5) >= 5} className="w-full flex items-center gap-3 bg-gray-50 dark:bg-gray-800 rounded-2xl p-3 disabled:opacity-50">
                            <span className="text-2xl">❤️</span>
                            <span className="flex-1 text-left"><span className="block font-bold text-sm text-gray-800 dark:text-gray-100">Refill Hearts</span><span className="block text-[11px] text-gray-400">{me?.hearts}/5 hearts</span></span>
                            <span className="font-extrabold text-sm">150 💎</span>
                        </button>
                        <button onClick={() => buy("streak_repair")} disabled={(me?.gems || 0) < 50 || !me?.streakBrokenAt} className="w-full flex items-center gap-3 bg-gray-50 dark:bg-gray-800 rounded-2xl p-3 disabled:opacity-50">
                            <span className="text-2xl">🛠️</span>
                            <span className="flex-1 text-left"><span className="block font-bold text-sm text-gray-800 dark:text-gray-100">Streak Repair</span><span className="block text-[11px] text-gray-400">{me?.streakBrokenAt ? "Fix a broken streak" : "No broken streak"}</span></span>
                            <span className="font-extrabold text-sm">50 💎</span>
                        </button>
                        {friends.length > 0 && (
                            <button onClick={() => onClose()} className="w-full flex items-center gap-3 bg-gray-50 dark:bg-gray-800 rounded-2xl p-3">
                                <span className="text-2xl">🤝</span>
                                <span className="flex-1 text-left"><span className="block font-bold text-sm text-gray-800 dark:text-gray-100">Tips &amp; Come Backs</span><span className="block text-[11px] text-gray-400">Send friends a tip or nudge them back</span></span>
                                <span className="font-extrabold text-sm text-[#1cb0f6]">SHOP TAB →</span>
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}