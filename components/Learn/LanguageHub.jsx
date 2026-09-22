"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/context/UserContext";
import Link from "next/link";

export default function LanguageHub() {
    const { user, ready } = useUser();
    const router = useRouter();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [starting, setStarting] = useState(null);

    const doLoad = useCallback(() => {
        fetch("/api/learn/languages", { credentials: "include" })
            .then((r) => r.json())
            .then((d) => {
                if (d.error) throw new Error(d.error);
                setData(d);
                setError("");
            })
            .catch((err) => setError(err.message || "Failed to load languages"))
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        if (!ready) {
            return;
        }
        let cancelled = false;
        (async () => {
            await Promise.resolve();
            if (!cancelled) doLoad();
        })();
        return () => { cancelled = true; };
    }, [ready, doLoad]);

    const retry = () => {
        setLoading(true);
        setError("");
        doLoad();
    };

    const me = data?.me;

    const startCourse = async (lang) => {
        if (!lang.available || starting) return;
        setStarting(lang.id);
        try {
            const r = await fetch("/api/learn/start", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ courseId: lang.id }),
            });
            const d = await r.json();
            if (!r.ok) throw new Error(d.error || "Couldn't start course");
            router.push(`/education/course/${lang.id}`);
        } catch (err) {
            setError(err.message || "Couldn't start course");
            setStarting(null);
        }
    };

    const available = (data?.languages || []).filter((l) => l.available);
    const comingSoon = (data?.languages || []).filter((l) => !l.available);

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-950 pb-24">
            <div className="max-w-3xl mx-auto px-4 py-6">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <Link href="/education" className="text-2xl font-extrabold text-[#58cc02] tracking-tight">
                            Education
                        </Link>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                            Learn a language step by step, just like the green owl.
                        </p>
                    </div>
                    {me?.currentCourse && (
                        <Link
                            href={`/education/course/${me.currentCourse}`}
                            className="text-sm font-bold text-white bg-[#58cc02] hover:bg-[#46a302] px-4 py-2 rounded-xl shadow-sm transition-colors shrink-0"
                        >
                            My course →
                        </Link>
                    )}
                </div>

                {loading ? (
                    <div className="flex justify-center py-16">
                        <div className="w-7 h-7 border-2 border-gray-300 dark:border-gray-700 border-t-[#58cc02] rounded-full animate-spin" />
                    </div>
                ) : error ? (
                    <div className="max-w-md mx-auto text-center py-12">
                        <span className="text-4xl block mb-3">🌵</span>
                        <p className="font-extrabold text-lg text-gray-800 dark:text-gray-100 mb-2">Couldn&apos;t load languages</p>
                        <p className="text-sm text-gray-400 mb-5">{error}</p>
                        <button onClick={retry} className="w-full py-3 rounded-2xl bg-[#58cc02] hover:bg-[#46a302] text-white font-extrabold text-sm">
                            ↺ Try again
                        </button>
                    </div>
                ) : (
                    <>
                        {me && (
                            <div className="mb-6 flex flex-wrap gap-2">
                                <span className="text-xs font-bold bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-full px-3 py-1.5">🔥 {me.streak} day streak</span>
                                <span className="text-xs font-bold bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-full px-3 py-1.5">⚡ {me.xp} XP</span>
                                <span className="text-xs font-bold bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-full px-3 py-1.5">💎 {me.gems} diamonds</span>
                                <span className="text-xs font-bold bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-full px-3 py-1.5">🏅 Level {me.level}</span>
                            </div>
                        )}

                        <h2 className="text-sm font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-3">
                            {available.length} languages ready to learn
                        </h2>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-8">
                            {available.map((lang) => (
                                <button
                                    key={lang.id}
                                    onClick={() => startCourse(lang)}
                                    disabled={starting === lang.id}
                                    className="group relative text-left bg-white dark:bg-gray-900 border-2 border-[#e5e5e5] dark:border-gray-800 rounded-2xl p-4 hover:border-[#58cc02] transition-all hover:shadow-md disabled:opacity-60"
                                >
                                    <span className="text-4xl block mb-3">{lang.flag}</span>
                                    <span className="font-bold text-sm text-gray-900 dark:text-gray-100 block">{lang.name}</span>
                                    <span className="text-xs text-gray-400 dark:text-gray-500">{lang.nativeName}</span>
                                    {lang.active && (
                                        <span className="absolute top-3 right-3 bg-[#58cc02] text-white text-[10px] font-bold px-2 py-0.5 rounded-full">ACTIVE</span>
                                    )}
                                    <span className="text-[11px] text-gray-400 mt-2 block">
                                        {lang.lessonsDone} lessons · {lang.crowns} crowns
                                    </span>
                                </button>
                            ))}
                        </div>

                        <h2 className="text-sm font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-3">
                            {comingSoon.length} more languages coming soon
                        </h2>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            {comingSoon.map((lang) => (
                                <div key={lang.id} className="relative bg-white/60 dark:bg-gray-900/50 border border-dashed border-gray-300 dark:border-gray-800 rounded-2xl p-4 opacity-70">
                                    <span className="text-4xl block mb-3">{lang.flag}</span>
                                    <span className="font-bold text-sm text-gray-500 dark:text-gray-400 block">{lang.name}</span>
                                    <span className="text-xs text-gray-400 dark:text-gray-500">{lang.nativeName}</span>
                                    <span className="absolute top-3 right-3 text-[10px] font-bold text-gray-400">SOON</span>
                                </div>
                            ))}
                        </div>

                        <div className="mt-8 bg-[#58cc02]/10 border border-[#58cc02]/30 rounded-2xl p-5 text-sm text-gray-600 dark:text-gray-300">
                            <p className="font-bold text-[#58cc02] mb-1">How it works</p>
                            <p className="text-gray-500 dark:text-gray-400 leading-relaxed">
                                Earn <b>XP</b> in lessons, keep your <b>daily streak</b> alive, compete in weekly
                                <b> leagues</b> with friends and learners worldwide, and spend <b>diamonds</b> on
                                streak freezes, tips and comeback requests.
                            </p>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}