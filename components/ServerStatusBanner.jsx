"use client";

import { useLiveServerStatus } from "@/utils/useLiveServerStatus";

/**
 * Global banner shown when the live server cannot be reached.
 *
 * Without this the app looks broken: sockets never connect, feeds stay empty and
 * every action fails silently. Saying "reconnecting" is honest about what is
 * happening, and the probe keeps retrying with backoff so the banner clears itself
 * the moment the server returns.
 */
export default function ServerStatusBanner() {
    const { offline } = useLiveServerStatus();
    if (!offline) return null;

    return (
        <div
            role="status"
            aria-live="polite"
            className="fixed top-0 inset-x-0 z-[9999] pointer-events-none"
        >
            <div className="flex justify-center px-3 pt-3">
                <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-amber-500 px-4 py-2 text-sm font-semibold text-white shadow-lg">
                    <span className="relative flex h-2.5 w-2.5">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
                        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white" />
                    </span>
                    Can&apos;t reach the server — reconnecting. Messages, voice and calls
                    will resume on their own.
                </div>
            </div>
        </div>
    );
}
