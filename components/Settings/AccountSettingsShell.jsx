"use client";

/**
 * Shell for `/settings`.
 *
 * Matches the sticky header pattern the other authenticated pages use
 * (`app/referrals`, `app/inbox`): a back affordance, a title, and a single
 * scrolling column. Exists as its own component so a second settings group can
 * be added later without re-deciding the layout.
 *
 * Renders nothing for a signed-out visitor rather than a redirect, because the
 * auth layer already sends them to /login and a redirect here would race it.
 */

import Link from "next/link";
import { useUser } from "@/context/UserContext";

export default function AccountSettingsShell({ children, title = "Settings" }) {
    const { user, ready } = useUser();

    if (!ready || !user) {
        return (
            <div className="min-h-dvh flex items-center justify-center bg-white dark:bg-gray-950">
                <div className="w-6 h-6 border-2 border-gray-300 dark:border-gray-700 border-t-gray-600 dark:border-t-gray-400 rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="min-h-dvh bg-white dark:bg-gray-950">
            <header className="sticky top-0 z-20 bg-white/90 dark:bg-gray-950/90 backdrop-blur border-b border-gray-200 dark:border-gray-800 safe-top">
                <div className="max-w-2xl mx-auto px-4 h-12 sm:h-14 flex items-center gap-3">
                    <Link
                        href="/profile"
                        className="p-2 -ml-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                        aria-label="Back to profile"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                        </svg>
                    </Link>
                    <span className="font-bold text-base text-gray-900 dark:text-gray-100 flex-1">{title}</span>
                </div>
            </header>

            <main className="max-w-2xl mx-auto px-4 py-5 safe-bottom">{children}</main>
        </div>
    );
}
