"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/context/UserContext";

const REPORT_REASONS = [
    "Spam or scam",
    "Harassment or bullying",
    "Hate speech",
    "Nudity or sexual content",
    "False information",
    "Impersonation",
    "Other",
];

/**
 * The overflow menu on someone's profile: report, mute and block.
 *
 * The app previously only had muted *words*, so on an anonymous network there
 * was no way to stop seeing a person or stop being able to receive their
 * messages. These actions map to the endpoints in live-server/routes/users.js
 * and are enforced server-side — hiding something in the UI is not what makes
 * a block work.
 *
 * Blocking is treated as the destructive option: it takes effect immediately,
 * drops the follow edges both ways, and cannot be undone from here (unblock
 * lives in Settings), so it asks for confirmation. Muting is reversible in
 * place and does not break the follow relationship.
 *
 * `hideReport` exists for the feed, which already has its own report control in
 * the post header. Without it, mounting this menu on a post would put two report
 * affordances a few pixels apart. Mute and block are still the point there: a
 * post is the first place you decide you never want to see someone again, and
 * there was previously no way to do that without leaving the feed.
 */
export default function UserActionsMenu({ username, onBlocked, isAdmin = false, hideReport = false }) {
    const { user } = useUser();
    const router = useRouter();

    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(null); // "mute" | "unmute" | "block" | "unblock" | "report"
    const [confirmBlock, setConfirmBlock] = useState(false);
    const [error, setError] = useState("");
    const [reported, setReported] = useState(false);
    const [done, setDone] = useState(""); // transient "Blocked" / "Unblocked" confirmation
    const wrapRef = useRef(null);

    useEffect(() => {
        if (!open) return;
        const onDown = (e) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target)) {
                setOpen(false);
                setConfirmBlock(false);
            }
        };
        const onKey = (e) => {
            if (e.key === "Escape") {
                setOpen(false);
                setConfirmBlock(false);
            }
        };
        document.addEventListener("mousedown", onDown);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onDown);
            document.removeEventListener("keydown", onKey);
        };
    }, [open]);

    useEffect(() => {
        if (!done) return;
        const t = setTimeout(() => setDone(""), 2500);
        return () => clearTimeout(t);
    }, [done]);

    if (!user?.username || user.username === username) return null;

    const call = async (action, body, method = "POST") => {
        setBusy(action);
        setError("");
        try {
            const res = await fetch(`/api/users/${encodeURIComponent(user.username)}/${action}`, {
                method,
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify(body),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data?.error || "Something went wrong");
            }
            return await res.json().catch(() => ({}));
        } finally {
            setBusy(null);
        }
    };

    const handleMute = async () => {
        try {
            const data = await call("mute", { target: username });
            const isMuted = (data?.mutedUsers || []).some(
                (u) => u.toLowerCase() === username.toLowerCase()
            );
            setOpen(false);
            setDone(isMuted ? `Muted @${username}` : `Unmuted @${username}`);
            onBlocked?.({ action: isMuted ? "muted" : "unmuted", username });
        } catch (err) {
            setError(err.message);
        }
    };

    const handleBlock = async () => {
        try {
            await call("block", { target: username });
            setOpen(false);
            setConfirmBlock(false);
            // A blocked profile is served as "not found", so leaving the user
            // on it would show a blank shell.
            onBlocked?.({ action: "blocked", username });
            router.push("/social");
        } catch (err) {
            setError(err.message);
        }
    };

    const handleUnblock = async () => {
        try {
            await call("block", { target: username }, "DELETE");
            setOpen(false);
            setConfirmBlock(false);
            setDone(`Unblocked @${username}`);
            onBlocked?.({ action: "unblocked", username });
        } catch (err) {
            setError(err.message);
        }
    };

    // Reports go to the shared moderation endpoint in live-server/routes/reports.js,
    // not to /api/users — there is no report action on the users router, so this
    // used to 404 on every reason.
    const handleReport = async (reason) => {
        setBusy("report");
        setError("");
        try {
            const res = await fetch("/api/reports", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ targetType: "user", targetId: username, reason }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data?.error || "Report failed");
            }
            setOpen(false);
            setReported(true);
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(null);
        }
    };

    const menuBtn =
        "w-full text-left px-3 py-2 text-sm rounded-lg transition-colors flex items-center gap-2.5 disabled:opacity-50";

    return (
        <div className="relative" ref={wrapRef}>
            <button
                onClick={() => { setOpen((v) => !v); setConfirmBlock(false); setError(""); }}
                aria-label={`Options for @${username}`}
                title={`Options for @${username}`}
                className="p-2.5 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM12.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM18.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z" />
                </svg>
            </button>

            {open && (
                <div className="absolute right-0 top-full z-40 mt-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg p-1.5 w-60">
                    {error && (
                        <p className="px-3 py-2 text-xs text-red-600 dark:text-red-400">{error}</p>
                    )}
                    {done && (
                        <p className="px-3 py-2 text-xs font-medium text-green-600 dark:text-green-400">
                            {done}
                        </p>
                    )}

                    {confirmBlock ? (
                        <div className="p-1">
                            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 px-2 py-1.5">
                                Block @{username}?
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 px-2 pb-2">
                                You won&apos;t see their posts or replies, they can&apos;t message you, and you&apos;ll stop following each other. You can undo this in Settings.
                            </p>
                            <button
                                onClick={handleBlock}
                                disabled={busy === "block"}
                                className={`${menuBtn} bg-red-600 text-white hover:bg-red-700 font-semibold justify-center`}
                            >
                                {busy === "block" ? "Blocking…" : "Block"}
                            </button>
                            <button
                                onClick={() => setConfirmBlock(false)}
                                className={`${menuBtn} text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 justify-center`}
                            >
                                Cancel
                            </button>
                        </div>
                    ) : (
                        <>
                            {!hideReport && (
                                <>
                                    <p className="px-3 py-2 text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                                        Report
                                    </p>
                                    {reported ? (
                                        <p className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">
                                            Thanks — this has been sent to the moderators.
                                        </p>
                                    ) : (
                                        <div className="max-h-52 overflow-y-auto">
                                            {REPORT_REASONS.map((reason) => (
                                                <button
                                                    key={reason}
                                                    onClick={() => handleReport(reason)}
                                                    disabled={busy === "report"}
                                                    className={`${menuBtn} text-gray-700 dark:text-gray-300 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400`}
                                                >
                                                    {reason}
                                                </button>
                                            ))}
                                        </div>
                                    )}

                                    <div className="my-1.5 border-t border-gray-200 dark:border-gray-700" />
                                </>
                            )}
                            <button
                                onClick={handleMute}
                                disabled={busy === "mute"}
                                className={`${menuBtn} text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800`}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4 shrink-0">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 9.75 19.5 12m0 0 2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
                                </svg>
                                Mute @{username}
                            </button>

                            {isAdmin && (
                                <button
                                    onClick={handleUnblock}
                                    className={`${menuBtn} text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800`}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4 shrink-0">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                                    </svg>
                                    Unblock (admin)
                                </button>
                            )}

                            <button
                                onClick={() => setConfirmBlock(true)}
                                disabled={busy === "block"}
                                className={`${menuBtn} text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 font-medium`}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4 shrink-0">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M18.36 18.36 5.64 5.64m12.72 0L5.64 18.36" />
                                </svg>
                                Block @{username}
                            </button>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
