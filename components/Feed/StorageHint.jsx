"use client";

/**
 * The composer's storage indicator.
 *
 * One line, above the toolbar, that answers "where is this going to be stored
 * and how much have I used" without anyone having to go looking. Two states:
 *
 *   own storage  "Yours · no limit"  — a positive signal. This is the state the
 *                  feature exists to reach, so it is worth surfacing rather than
 *                  hiding; it is the answer to "is my video going to be on their
 *                  server?" and the answer should be visible, not in a settings
 *                  page.
 *   site storage a metered bar. Shown only once a post with media is staged or
 *                  while close to the limit, because a permanent meter above the
 *                  composer is nagging and the number matters only when it is
 *                  about to stop them doing something.
 *
 * Copy stays on ownership and allowance. Nothing here mentions cost.
 */

import Link from "next/link";

function gb(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
    return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export default function StorageHint({ media, hasMedia = false }) {
    if (!media) return null;

    // Nothing to say for an account that cannot upload at all: the composer
    // already offers them the link route, and a storage meter next to a
    // disabled button is just noise.
    if (!media.canUpload) return null;

    if (media.usingOwnStorage) {
        return (
            <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mb-1.5 flex items-center gap-1.5">
                <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
                </svg>
                <span>Uploads go to your own storage</span>
                <Link href="/settings" className="underline hover:no-underline opacity-80">manage</Link>
            </p>
        );
    }

    const q = media.quota;
    if (!q?.quotaBytes) return null;

    const pct = Math.min(100, (q.usedBytes / q.quotaBytes) * 100);
    const near = pct > 85;
    // Only surfaced when it is actionable: media is staged, or the allowance is
    // nearly gone. Otherwise there is no line here at all.
    if (!hasMedia && !near) return null;

    return (
        <div className="mb-1.5">
            <div className="flex items-center justify-between text-[11px] mb-0.5">
                <span className={near ? "text-amber-600 dark:text-amber-400" : "text-gray-400 dark:text-gray-500"}>
                    {gb(q.usedBytes)} of {gb(q.quotaBytes)} storage used
                </span>
                <Link href="/settings" className="text-gray-400 dark:text-gray-500 hover:underline">
                    use your own
                </Link>
            </div>
            <div className="h-1 rounded-full bg-gray-200 dark:bg-gray-800 overflow-hidden">
                <div
                    className={`h-full rounded-full ${near ? "bg-amber-500" : "bg-gray-400 dark:bg-gray-600"}`}
                    style={{ width: `${Math.max(2, pct)}%` }}
                />
            </div>
        </div>
    );
}
