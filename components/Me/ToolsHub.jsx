"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useUser } from "@/context/UserContext";

/**
 * The overflow drawer for secondary tools.
 *
 * The in-app browser used to own a top-level nav slot (and a bottom-nav tab on
 * mobile) despite being the only feature that could not earn a cent and the
 * only one that turned the server into an open relay for third-party sites. It
 * lives here now, behind its `use_browser` permission, so it stays available
 * without competing with the product for a slot.
 */
const TOOLS = [
    {
        key: "browser",
        href: "/me/tools/browser",
        icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="m6.429 9.75 5.571-3.42v13.34m0 0-4.75-2.867a2.25 2.25 0 0 0-2.287-.08L2.25 17.75V6.75a2.25 2.25 0 0 1 1.665-2.16l5.226-1.307a2.25 2.25 0 0 1 1.76.183l5.11 2.806a2.25 2.25 0 0 0 2.393-.035l.016-.009a2.25 2.25 0 0 1 3.42 1.91v11.13a2.25 2.25 0 0 1-1.954 2.232l-5.226 1.307a2.25 2.25 0 0 1-1.76-.183l-5.109-2.806Z" />
            </svg>
        ),
        title: "Browser",
        description: "Open the web inside the app.",
        permission: "use_browser",
    },
];

export default function ToolsHub() {
    const { user } = useUser();
    const [allowed, setAllowed] = useState({});

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch("/api/users/me/permissions", { credentials: "include" });
                if (!res.ok) return;
                const data = await res.json();
                if (cancelled) return;
                const perms = new Set(data?.permissions || []);
                setAllowed(
                    Object.fromEntries(
                        TOOLS.map((t) => [
                            t.key,
                            !t.permission || data?.isAdmin || perms.has(t.permission),
                        ])
                    )
                );
            } catch {
                // leave everything hidden; the routes enforce it regardless
            }
        })();
        return () => { cancelled = true; };
    }, []);

    const visible = TOOLS.filter((t) => allowed[t.key]);

    return (
        <div className="min-h-dvh bg-gray-50 dark:bg-gray-950">
            <header className="sticky top-0 z-20 bg-white/90 dark:bg-gray-950/90 backdrop-blur border-b border-gray-200 dark:border-gray-800 safe-top">
                <div className="max-w-2xl mx-auto px-4 h-12 sm:h-14 flex items-center gap-3">
                    <Link
                        href="/me"
                        aria-label="Back"
                        className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 rounded-full transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                    >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                        </svg>
                    </Link>
                    <span className="font-bold text-base text-gray-900 dark:text-gray-100 flex-1">Tools</span>
                </div>
            </header>

            <main className="max-w-2xl mx-auto px-4 py-4">
                {visible.length === 0 ? (
                    <div className="bg-white dark:bg-gray-900 rounded-2xl px-4 py-10 text-center">
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            No tools are enabled for your account.
                        </p>
                    </div>
                ) : (
                    <ul className="bg-white dark:bg-gray-900 rounded-2xl overflow-hidden divide-y divide-gray-100 dark:divide-gray-800">
                        {visible.map((t) => (
                            <li key={t.key}>
                                <Link
                                    href={t.href}
                                    className="flex items-center gap-4 px-4 py-4 min-h-[64px] hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors"
                                >
                                    <span className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-600 dark:text-gray-300 shrink-0">
                                        {t.icon}
                                    </span>
                                    <span className="flex-1 min-w-0">
                                        <span className="block text-sm font-semibold text-gray-900 dark:text-gray-100">
                                            {t.title}
                                        </span>
                                        <span className="block text-xs text-gray-500 dark:text-gray-400 truncate">
                                            {t.description}
                                        </span>
                                    </span>
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 text-gray-400 shrink-0">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                                    </svg>
                                </Link>
                            </li>
                        ))}
                    </ul>
                )}

                {user?.isAdmin && (
                    <p className="mt-4 px-1 text-xs text-gray-500 dark:text-gray-400">
                        Admins bypass tool permissions. Grant the Browser permission from
                        Admin → Manage → Roles.
                    </p>
                )}
            </main>
        </div>
    );
}
