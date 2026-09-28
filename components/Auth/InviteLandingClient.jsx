"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useUser } from "@/context/UserContext";
import { getRedirectTarget, withRedirect } from "@/utils/redirect";
import BrandLogo from "@/components/common/BrandLogo";

/**
 * `/invite/[code]` — what a scanned QR actually lands on.
 *
 * This page used to bounce every signed-in visitor straight to the app
 * (`router.replace(redirectTo)`) and, for everyone else, call a
 * `POST /api/invites/validate` route that was never registered. So the QR either
 * did nothing or said the code was invalid. Both branches are now real:
 *
 *  - signed out  → show who invited you, keep the code for signup attribution
 *  - signed in   → resolve the person and let them write a greeting
 *
 * The greeting is composed here and sent through `POST /api/invites/greet`,
 * which is an ordinary DM underneath, so the thread it opens is the same thread
 * a hand-typed first message would have produced. On success the visitor is sent
 * to that thread rather than to the app home, because "I just sent a message"
 * with no way to see it land is the fastest way to lose trust in a feature.
 */
/**
 * Declared at module scope, not inside the component. A component defined during
 * render is a new type on every pass, which remounts its subtree and throws away
 * its state each time — and it made this element illegal to appear in both the
 * self-scan branch and the greet branch.
 */
function InviterChip({ inviter }) {
    return (
        <div className="flex items-center justify-center gap-3">
            {inviter.avatarUrl ? (
                <img src={inviter.avatarUrl} alt="" className="w-14 h-14 rounded-full object-cover" />
            ) : (
                <div
                    className="w-14 h-14 rounded-full flex items-center justify-center text-white text-xl font-bold"
                    style={{ backgroundColor: inviter.avatarColor }}
                >
                    {inviter.username?.[0]?.toUpperCase() ?? "?"}
                </div>
            )}
            <div className="text-left min-w-0">
                <p className="font-bold text-gray-900 dark:text-gray-100 truncate">
                    {inviter.displayName || inviter.username}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">@{inviter.username}</p>
            </div>
        </div>
    );
}

export default function InviteLandingClient({ inviteCode }) {
    const { user, ready } = useUser();
    const router = useRouter();
    const searchParams = useSearchParams();
    const redirectTo = getRedirectTarget(searchParams);

    const [state, setState] = useState("loading"); // loading | error | ready
    const [error, setError] = useState("");
    const [inviter, setInviter] = useState(null);
    const [isSelf, setIsSelf] = useState(false);
    const [canGreet, setCanGreet] = useState(false);
    const [text, setText] = useState("");
    const [sending, setSending] = useState(false);
    const [sendError, setSendError] = useState("");

    const MAX = 500;
    const signedIn = !!user && !user.needsSetup;

    // One place that turns a resolve response into state, so the mount fetch and
    // the retry button cannot drift apart.
    const applyResolved = useCallback((data) => {
        setInviter(data.inviter);
        setIsSelf(!!data.isSelf);
        setCanGreet(!!data.canGreet);
        setText(data.suggestedGreeting || "");
        setError("");
        setState("ready");
    }, []);

    const resolve = useCallback(async () => {
        try {
            const res = await fetch(`/api/invites/resolve/${encodeURIComponent(inviteCode)}`, {
                credentials: "include",
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "That invite code is not valid");
            applyResolved(data);
        } catch (err) {
            setError(err.message || "That invite code is not valid");
            setState("error");
        }
    }, [inviteCode, applyResolved]);

    // Inline async IIFE, the same shape `CreateGroup.jsx` uses for its contact
    // fetch. Calling a setState-holding function directly from the effect body
    // re-renders on mount before anything has been asked for; the initial state is
    // already "loading" and `ready` gates it so a signed-out visitor never fires
    // the request.
    useEffect(() => {
        if (!ready) return;
        (async () => {
            try {
                const res = await fetch(`/api/invites/resolve/${encodeURIComponent(inviteCode)}`, {
                    credentials: "include",
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || "That invite code is not valid");
                applyResolved(data);
            } catch (err) {
                setError(err.message || "That invite code is not valid");
                setState("error");
            }
        })();
    }, [ready, inviteCode, applyResolved]);

    const greet = async () => {
        const body = text.trim();
        if (!body || sending) return;
        setSending(true);
        setSendError("");
        try {
            const res = await fetch("/api/invites/greet", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ code: inviteCode, text: body }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Your greeting could not be sent");
            // Land in the thread that was just opened, not the app home.
            router.replace(`/inbox?user=${encodeURIComponent(data.conversation.username)}`);
        } catch (err) {
            setSendError(err.message || "Your greeting could not be sent");
            setSending(false);
        }
    };

    if (!ready) {
        return (
            <div className="flex h-dvh items-center justify-center dark:bg-gray-950">
                <div className="w-6 h-6 border-2 border-gray-300 dark:border-gray-700 border-t-gray-600 dark:border-t-gray-400 rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="min-h-dvh bg-white dark:bg-gray-950 flex flex-col">
            <div className="border-b border-gray-100 dark:border-gray-800 px-6 py-4">
                <BrandLogo />
            </div>

            <div className="flex-1 flex items-center justify-center px-6 py-10 safe-bottom">
                <div className="w-full max-w-sm text-center space-y-5">
                    {state === "loading" ? (
                        <div className="flex flex-col items-center gap-4">
                            <div className="w-10 h-10 border-2 border-gray-300 dark:border-gray-700 border-t-gray-600 dark:border-t-gray-400 rounded-full animate-spin" />
                            <p className="text-sm text-gray-500 dark:text-gray-400">Looking up this invite…</p>
                        </div>
                    ) : state === "error" ? (
                        <>
                            <div className="w-16 h-16 mx-auto rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 text-red-500">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                                </svg>
                            </div>
                            <div>
                                <h1 className="text-xl font-black text-gray-900 dark:text-gray-100 mb-1">Invalid Invite</h1>
                                <p className="text-sm text-gray-500 dark:text-gray-400">{error}</p>
                            </div>
                            <button
                                onClick={() => { setState("loading"); resolve(); }}
                                className="w-full min-h-[44px] px-6 py-3 bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-bold rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                            >
                                Try again
                            </button>
                            <button
                                onClick={() => router.replace(signedIn ? redirectTo : withRedirect("/login", searchParams))}
                                className="w-full min-h-[44px] px-6 py-3 bg-black dark:bg-gray-100 text-white dark:text-gray-900 font-bold rounded-xl hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors"
                            >
                                {signedIn ? "Back to the app" : "Go to Sign In"}
                            </button>
                        </>
                    ) : isSelf ? (
                        /* Scanning your own code. Not an error — people do it to
                         * check the QR renders — but there is nothing to send. */
                        <>
                            <InviterChip inviter={inviter} />
                            <h1 className="text-xl font-black text-gray-900 dark:text-gray-100">That&apos;s your code</h1>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                Show this screen to someone else so they can add you.
                            </p>
                            <button
                                onClick={() => router.replace(redirectTo)}
                                className="w-full min-h-[44px] px-6 py-3 bg-black dark:bg-gray-100 text-white dark:text-gray-900 font-bold rounded-xl hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors"
                            >
                                Done
                            </button>
                        </>
                    ) : !signedIn ? (
                        <>
                            <div className="w-16 h-16 mx-auto rounded-full bg-green-50 dark:bg-green-900/20 flex items-center justify-center">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 text-green-500">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" />
                                </svg>
                            </div>
                            <div>
                                <h1 className="text-xl font-black text-gray-900 dark:text-gray-100 mb-1">You&apos;re Invited!</h1>
                                {inviter && (
                                    <p className="text-sm text-gray-500 dark:text-gray-400">
                                        Invited by <span className="font-semibold text-gray-700 dark:text-gray-300">@{inviter.username}</span>
                                    </p>
                                )}
                            </div>
                            <p className="text-xs text-gray-400 dark:text-gray-500">
                                Code: <span className="font-mono font-bold">{inviteCode}</span>
                            </p>
                            <button
                                onClick={() => router.replace(withRedirect(`/login?invite=${inviteCode}`, searchParams))}
                                className="w-full min-h-[44px] px-6 py-3 bg-black dark:bg-gray-100 text-white dark:text-gray-900 font-bold rounded-xl hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors"
                            >
                                Create Account
                            </button>
                        </>
                    ) : (
                        /* The path the whole feature exists for. */
                        <>
                            {/* An <h1> like every other branch, so the page still has
                                one document heading on the branch people land on
                                most. The scanned person's name is the <p> below. */}
                            <h1 className="text-xl font-black text-gray-900 dark:text-gray-100">
                                Add a person
                            </h1>
                            <InviterChip inviter={inviter} />
                            {inviter.bio && (
                                <p className="text-sm text-gray-500 dark:text-gray-400 text-center line-clamp-2">“{inviter.bio}”</p>
                            )}

                            {canGreet ? (
                                <>
                                    <div className="text-left">
                                        <label htmlFor="greeting" className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                                            Write a greeting
                                        </label>
                                        <textarea
                                            id="greeting"
                                            value={text}
                                            onChange={(e) => setText(e.target.value.slice(0, MAX))}
                                            rows={3}
                                            className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2.5 text-base sm:text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 outline-none focus:border-blue-400 dark:focus:border-blue-500 resize-none transition-colors"
                                        />
                                        <div className="flex items-center justify-between mt-1">
                                            <span className="text-[11px] text-gray-400 dark:text-gray-500">You can edit this before sending.</span>
                                            <span className="text-[11px] text-gray-400">{text.length}/{MAX}</span>
                                        </div>
                                    </div>

                                    {sendError && (
                                        <p className="text-xs text-red-500 dark:text-red-400 text-left" role="alert">{sendError}</p>
                                    )}

                                    <button
                                        onClick={greet}
                                        disabled={!text.trim() || sending}
                                        className="w-full min-h-[44px] px-6 py-3 bg-black dark:bg-gray-100 text-white dark:text-gray-900 font-bold rounded-xl hover:bg-gray-800 dark:hover:bg-gray-200 disabled:opacity-40 transition-colors"
                                    >
                                        {sending ? "Sending…" : `Say hello to @${inviter.username}`}
                                    </button>
                                    <p className="text-[11px] text-gray-400 dark:text-gray-500 text-center">
                                        They can mute or block you like anyone else.
                                    </p>
                                </>
                            ) : (
                                /* Signed in, but the budget is spent. Say so plainly
                                 * and leave a way forward rather than a dead end. */
                                <div className="space-y-3">
                                    <p className="text-sm text-gray-500 dark:text-gray-400">
                                        @{inviter.username} has reached their greeting limit for today.
                                    </p>
                                    <button
                                        onClick={() => router.replace(`/inbox?user=${encodeURIComponent(inviter.username)}`)}
                                        className="w-full min-h-[44px] px-6 py-3 bg-black dark:bg-gray-100 text-white dark:text-gray-900 font-bold rounded-xl hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors"
                                    >
                                        Message them directly
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
