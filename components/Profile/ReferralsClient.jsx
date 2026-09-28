"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/context/UserContext";
import Link from "next/link";
import QrCanvas from "@/components/Qr/QrCanvas";

function UserAvatar({ username, avatarUrl }) {
    const palette = ["#f97316","#ec4899","#8b5cf6","#06b6d4","#10b981","#f59e0b","#ef4444","#3b82f6"];
    let hash = 0;
    for (const ch of username || "") hash = (hash * 31 + ch.charCodeAt(0)) & 0xffffffff;
    const color = palette[Math.abs(hash) % palette.length];

    if (avatarUrl) {
        return <img src={avatarUrl} alt={username} className="w-10 h-10 rounded-full object-cover" />;
    }
    return (
        <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold"
            style={{ backgroundColor: color }}>
            {username?.[0]?.toUpperCase() ?? "?"}
        </div>
    );
}

export default function ReferralsClient() {
    const { user, ready } = useUser();
    const router = useRouter();
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [copied, setCopied] = useState(false);

    // Inline async IIFE, the same shape `CreateGroup.jsx` uses. The redirect and
    // the guard are the only synchronous part; the request itself is a callback
    // from an external system, which is what this effect is for.
    useEffect(() => {
        if (!ready) return;
        if (!user) { router.replace("/login"); return; }
        (async () => {
            try {
                const res = await fetch("/api/referrals");
                if (res.ok) setStats(await res.json());
            } catch {}
            setLoading(false);
        })();
    }, [ready, user, router]);

    // The QR encodes an absolute link, not the path. `shareUrl` comes back as a
    // path because the API does not know the public host, so it is resolved
    // against this page's own origin here — a scanned code has to work for
    // whoever is holding the phone, not only for a user already on the site.
    const shareUrl = stats?.shareUrl
        ? new URL(stats.shareUrl, typeof window !== "undefined" ? window.location.origin : "https://anontweet.duckdns.org").toString()
        : "";

    // Defaulted rather than trusted. This page shipped expecting a payload that
    // no route ever sent, and it crashed on `undefined.length`; a missing list
    // should read as "nobody yet" instead of taking the page down.
    const referredUsers = stats?.referredUsers || [];

    if (!ready || !user) {
        return (
            <div className="min-h-dvh bg-white dark:bg-gray-950 flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-gray-300 dark:border-gray-700 border-t-gray-600 dark:border-t-gray-400 rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="min-h-dvh bg-white dark:bg-gray-950">
            <header className="sticky top-0 z-20 bg-white/90 dark:bg-gray-950/90 backdrop-blur border-b border-gray-200 dark:border-gray-800 safe-top">
                <div className="max-w-2xl mx-auto px-4 h-12 sm:h-14 flex items-center gap-3">
                    <Link href={`/profile/${encodeURIComponent(user.username)}`} className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                        </svg>
                    </Link>
                    <span className="font-bold text-base text-gray-900 dark:text-gray-100 flex-1">Referrals</span>
                </div>
            </header>

            <main className="max-w-2xl mx-auto px-4 py-6">
                {loading ? (
                    <div className="flex justify-center py-12">
                        <div className="w-6 h-6 border-2 border-gray-300 dark:border-gray-700 border-t-gray-600 dark:border-t-gray-400 rounded-full animate-spin" />
                    </div>
                ) : stats ? (
                    <>
                        {/* The code, first and largest. A referrals page that shows
                            a number but not the thing you share is a stats screen,
                            not a growth tool, so the shareable artefact leads. */}
                        <div className="flex flex-col items-center gap-3 mb-6 p-5 bg-gray-50 dark:bg-gray-800/50 rounded-2xl">
                            <QrCanvas value={shareUrl} size={184} />
                            <p className="font-mono font-bold text-lg tracking-[0.2em] text-gray-900 dark:text-gray-100">
                                {stats.code}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                                Anyone who signs up with this code is counted below.
                            </p>
                            <div className="grid grid-cols-2 gap-2 w-full max-w-xs">
                                <button
                                    onClick={async () => {
                                        try {
                                            await navigator.clipboard.writeText(shareUrl);
                                            setCopied(true);
                                            setTimeout(() => setCopied(false), 2000);
                                        } catch { /* denied */ }
                                    }}
                                    className="min-h-[44px] px-4 py-2.5 bg-black dark:bg-gray-100 text-white dark:text-gray-900 font-semibold rounded-xl hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors"
                                >
                                    {copied ? "Link copied" : "Copy link"}
                                </button>
                                {typeof navigator !== "undefined" && "share" in navigator && (
                                    <button
                                        onClick={async () => {
                                            try {
                                                await navigator.share({ title: "Join me on AnonFeed", url: shareUrl });
                                            } catch { /* dismissed */ }
                                        }}
                                        className="min-h-[44px] px-4 py-2.5 bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-semibold rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                                    >
                                        Share
                                    </button>
                                )}
                            </div>
                        </div>

                        {stats.referredBy && (
                            <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800">
                                <p className="text-sm text-blue-600 dark:text-blue-400">
                                    Invited by <span className="font-semibold">@{stats.referredBy}</span>
                                </p>
                            </div>
                        )}

                        <div className="grid grid-cols-3 gap-3 mb-6">
                            <div className="text-center p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
                                <span className="text-2xl font-black text-gray-900 dark:text-gray-100 block">{stats.totalInvited}</span>
                                <span className="text-xs text-gray-500 dark:text-gray-400">Friends joined</span>
                            </div>
                            <div className="text-center p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
                                <span className="text-2xl font-black text-gray-900 dark:text-gray-100 block">{stats.stats.activeCodes}</span>
                                <span className="text-xs text-gray-500 dark:text-gray-400">Active codes</span>
                            </div>
                            <div className="text-center p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
                                <span className="text-2xl font-black text-gray-900 dark:text-gray-100 block">{stats.stats.usedCodes}</span>
                                <span className="text-xs text-gray-500 dark:text-gray-400">Used codes</span>
                            </div>
                        </div>

                        <div className="flex items-center justify-between mb-3">
                            <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                Friends who joined ({referredUsers.length})
                            </h2>
                            <Link
                                href={`/profile/${encodeURIComponent(user.username)}`}
                                className="text-xs text-blue-500 hover:text-blue-600 font-medium"
                            >
                                Manage invites
                            </Link>
                        </div>

                        {referredUsers.length === 0 ? (
                            <div className="text-center py-12">
                                <p className="text-sm text-gray-400 dark:text-gray-500">No friends have joined yet</p>
                                <p className="text-xs text-gray-300 dark:text-gray-600 mt-1">Share your invite codes to get started!</p>
                            </div>
                        ) : (
                            <div className="border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden divide-y divide-gray-100 dark:divide-gray-800">
                                {referredUsers.map((u) => (
                                    <Link
                                        key={u.username}
                                        href={`/profile/${encodeURIComponent(u.username)}`}
                                        className="flex items-center gap-3 p-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                                    >
                                        <UserAvatar username={u.username} avatarUrl={u.avatarUrl} />
                                        <div className="flex-1 min-w-0">
                                            <span className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate block">{u.username}</span>
                                            <span className="text-[11px] text-gray-400 dark:text-gray-500">
                                                Joined {new Date(u.joinedAt).toLocaleDateString()}
                                            </span>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        )}
                    </>
                ) : (
                    <div className="text-center py-12">
                        <p className="text-sm text-gray-400 dark:text-gray-500">Failed to load referral stats</p>
                    </div>
                )}
            </main>
        </div>
    );
}
