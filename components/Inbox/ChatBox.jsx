"use client";

import { useEffect, useRef, useState } from "react";
import { useUser } from "@/context/UserContext";
import { useCall } from "@/context/CallContext";
import Chat from "./Chat";
import Input from "./Input";
import ProfileSetup from "@/components/ProfileSetup";
import UserBadges from "@/components/shared/UserBadges";
import { useOnlineStatus, getLastSeenText } from "@/utils/useOnlineStatus";
import { useToast } from "@/context/ToastContext";

export default function ChatBox({ onBack, recipient, recipientUser, archived = false, muted = false, onConversationChange }) {
    const { user, ready } = useUser();
    const { startCall } = useCall();
    const { showToast } = useToast();
    const [pendingMessage, setPendingMessage] = useState(null);
    const [replyingTo, setReplyingTo]         = useState(null);
    const [editingProfile, setEditingProfile] = useState(false);
    const scrollContainerRef = useRef(null);
    const [isTyping, setIsTyping] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [recipientOnlineStatus, setRecipientOnlineStatus] = useState(null);
    const [showOptions, setShowOptions] = useState(false);

    // Archive / mute / starred-messages. All three change what the *reader*
    // sees, never what is delivered.
    const runOption = async (action) => {
        setShowOptions(false);
        if (!recipient) return;
        if (action === "viewStarred") {
            const res = await fetch("/api/messages/starred", { credentials: "include" });
            if (res.ok) {
                const list = await res.json();
                showToast(
                    list.length
                        ? `You have ${list.length} starred message${list.length === 1 ? "" : "s"}`
                        : "No starred messages yet — tap the star on any message",
                    "info"
                );
            }
            return;
        }
        try {
            const res = await fetch("/api/messages/conversation", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ with: recipient, action }),
            });
            if (res.ok) {
                onConversationChange?.(action);
                showToast(
                    action === "archive" ? "Chat archived"
                        : action === "unarchive" ? "Chat unarchived"
                        : action === "mute" ? "Chat muted"
                        : "Chat unmuted",
                    "success"
                );
            } else {
                showToast("Could not update that chat", "error");
            }
        } catch {
            showToast("Network error", "error");
        }
    };

    // Track current user's online status
    useOnlineStatus(user?.username);

    // Poll for typing/recording status
    //
    // Gated on `document.hidden`: a backgrounded tab kept asking every 3s for
    // a state nobody could see, which is pure battery and bandwidth. The
    // `visibilitychange` listener re-polls the instant the tab comes back, so
    // the indicator is never stale on return — which is exactly when the user
    // is looking at the header.
    useEffect(() => {
        if (!recipient || !user?.username) return;
        let disposed = false;
        const poll = async () => {
            if (document.hidden) return;
            try {
                const res = await fetch(`/api/typing?username=${encodeURIComponent(user.username)}`, {
                    credentials: 'include'
                });
                if (res.ok) {
                    const data = await res.json();
                    // The cleanup can land between the request and the response;
                    // without this, switching chats mid-flight wrote the previous
                    // recipient's typing state into the thread just opened.
                    if (disposed) return;
                    const isThem = data.typingUser === recipient;
                    setIsTyping(isThem && !!data.isTyping);
                    setIsRecording(isThem && !!data.isRecording);
                }
            } catch { /* silent */ }
        };
        const onVisibility = () => { if (!document.hidden) poll(); };
        poll();
        const id = setInterval(poll, 3000);
        document.addEventListener("visibilitychange", onVisibility);
        return () => {
            disposed = true;
            clearInterval(id);
            document.removeEventListener("visibilitychange", onVisibility);
        };
    }, [recipient, user?.username]);

    // Poll for recipient's online status
    //
    // Same two defects as the typing poll above: it asked every 30s for a state
    // nobody could see while the tab was hidden, and nothing guarded the write
    // after the await — switching chats mid-flight painted the PREVIOUS
    // recipient's last-seen into the thread that had just been opened.
    useEffect(() => {
        if (!recipient) return;
        let disposed = false;
        const fetchStatus = async () => {
            if (document.hidden) return;
            try {
                const res = await fetch(`/api/users/online?usernames=${encodeURIComponent(recipient)}`, {
                    credentials: 'include'
                });
                if (disposed) return;
                if (res.ok) {
                    const data = await res.json();
                    const status = data.users?.[recipient];
                    if (status) {
                        setRecipientOnlineStatus({
                            username: recipient,
                            isOnline: status.isOnline,
                            lastActive: status.lastActive,
                        });
                    }
                }
            } catch { /* silent */ }
        };
        const onVisibility = () => { if (!document.hidden) fetchStatus(); };
        fetchStatus();
        const id = setInterval(fetchStatus, 30000);
        document.addEventListener("visibilitychange", onVisibility);
        return () => {
            disposed = true;
            clearInterval(id);
            document.removeEventListener("visibilitychange", onVisibility);
        };
    }, [recipient]);

    // Reset per-conversation state when switching chats
    useEffect(() => {
        setPendingMessage(null);
        setReplyingTo(null);
    }, [recipient]);

    if (!ready) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="w-6 h-6 border-2 border-gray-300 dark:border-gray-700 border-t-gray-600 dark:border-t-gray-400 rounded-full animate-spin" />
            </div>
        );
    }

    if (!user || editingProfile) {
        // First run has no username yet and `/api/auth/setup` rejects an empty
        // one, so the name field stays; editing an existing profile is
        // color-only and resubmits the unchanged username.
        return <ProfileSetup allowNameChange={!user} onDone={() => setEditingProfile(false)} />;
    }

    return (
        // `safe-bottom` stays on the column: it only needs to lift the composer
        // clear of the home indicator, and there is no background up there to
        // paint.
        //
        // `safe-top` used to live here too, and that is what produced the gap the
        // user reported: padding on the COLUMN displaces the whole thread, so the
        // status-bar inset rendered as an unstyled band of `<main>`'s background
        // above the header — a blank strip the height of the notch. The inset has
        // to be absorbed by the header's own `padding-top` instead, so the
        // header's background fills it and the header visually starts at the top
        // of the screen. The inset is combined with the rem size inside a single
        // padding arbitrary value rather than applied via `.safe-top` on
        // purpose: `.safe-*` are unlayered rules in globals.css and
        // would beat a layered `py-*`, so `safe-top` + `py-3` on one element means
        // padding-top is env() alone and the row collapses to nothing wherever
        // the inset is 0. Adding the two together in one calc sidesteps that
        // entirely, and it is what every other header in the app does.
        //
        // NB: the literal utility name is deliberately NOT written out in this
        // comment. Tailwind v4 scans raw source text for class-like candidates
        // and does not strip comments first, so a quoted padding utility
        // containing a truncated env() here was collected as a real candidate and
        // then failed to compile — that was the long-standing "1 warning while
        // optimizing generated CSS" on every build. Describe the utility in prose
        // instead of quoting it.
        <div className="flex flex-col h-full safe-bottom">

            {/* ── Header ──────────────────────────────────────────────────── */}
            <header className="sticky top-0 z-20 flex items-center gap-2 px-3 md:px-6 pt-[calc(0.75rem+env(safe-area-inset-top,0px))] pb-3 md:pt-[calc(1rem+env(safe-area-inset-top,0px))] md:pb-4 border-b border-gray-200 dark:border-gray-800 shrink-0 bg-white dark:bg-gray-950">

                {onBack && (
                    <button
                        onClick={onBack}
                        aria-label="Back"
                        className="md:hidden text-gray-800 dark:text-gray-200 hover:text-gray-600 dark:hover:text-gray-400 transition-colors p-2.5 -ml-1 shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
                            strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                        </svg>
                    </button>
                )}

                <div
                    className="w-9 h-9 md:w-10 md:h-10 rounded-full flex items-center justify-center text-white font-bold text-sm md:text-base select-none shrink-0"
                    style={{ backgroundColor: recipientUser?.color || "#3b82f6" }}
                >
                    {recipientUser?.avatarUrl ? (
                        <img src={recipientUser.avatarUrl} alt="" className="w-full h-full rounded-full object-cover" />
                    ) : (
                        (recipient || user?.username)?.[0]?.toUpperCase() ?? "?"
                    )}
                </div>

                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                        <p className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate">{recipient || user?.username}</p>
                        <UserBadges isPro={recipientUser?.isPro} isVerified={recipientUser?.isVerified} isAdmin={recipientUser?.isAdmin} roles={recipientUser?.roles || []} size="sm" />
                    </div>
                    {isRecording ? (
                        <div className="flex items-center gap-1.5">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-3 h-3 text-red-500 animate-pulse">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
                            </svg>
                            <p className="text-xs text-red-500 dark:text-red-400 animate-pulse">recording voice...</p>
                        </div>
                    ) : isTyping ? (
                        <p className="text-xs text-blue-500 dark:text-blue-400 animate-pulse">typing...</p>
                    ) : recipientOnlineStatus && (
                        <div className="flex items-center gap-1.5">
                            {recipientOnlineStatus.isOnline && (
                                <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                            )}
                            <p className={`text-xs ${recipientOnlineStatus.isOnline ? 'text-green-600 dark:text-green-400' : 'text-gray-400 dark:text-gray-500'}`}>
                                {getLastSeenText(recipientOnlineStatus.lastActive, recipientOnlineStatus.isOnline)}
                            </p>
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-1 md:gap-2 text-gray-700 dark:text-gray-400 shrink-0">
                    <button
                        onClick={() => setEditingProfile(true)}
                        aria-label="Edit profile"
                        title="Edit profile"
                        className="hover:text-gray-900 dark:hover:text-gray-100 transition-colors p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
                            strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round"
                                d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0zM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                        </svg>
                    </button>

                    <button
                        onClick={() => recipient && startCall(recipient, "audio")}
                        aria-label="Audio call"
                        className="hover:text-gray-900 dark:hover:text-gray-100 transition-colors p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
                            strokeWidth={1.8} stroke="currentColor" className="w-5 h-5 md:w-6 md:h-6">
                            <path strokeLinecap="round" strokeLinejoin="round"
                                d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z" />
                        </svg>
                    </button>

                    <button
                        onClick={() => recipient && startCall(recipient, "video")}
                        aria-label="Video call"
                        className="hover:text-gray-900 dark:hover:text-gray-100 transition-colors p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
                            strokeWidth={1.8} stroke="currentColor" className="w-5 h-5 md:w-6 md:h-6">
                            <path strokeLinecap="round" strokeLinejoin="round"
                                d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25z" />
                        </svg>
                    </button>

                    {/* Was a dead button: no onClick, no title, rendered as
                        "Info" beside two working call buttons. It is now the
                        conversation menu — archive and mute had no affordance
                        anywhere in the app. */}
                    <div className="relative">
                        <button
                            onClick={() => setShowOptions((v) => !v)}
                            aria-label="Conversation options"
                            aria-expanded={showOptions}
                            title="Conversation options"
                            className="hover:text-gray-900 dark:hover:text-gray-100 transition-colors p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
                                strokeWidth={1.8} stroke="currentColor" className="w-5 h-5 md:w-6 md:h-6">
                                <path strokeLinecap="round" strokeLinejoin="round"
                                    d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0zm-9-3.75h.008v.008H12V8.25z" />
                            </svg>
                        </button>

                        {showOptions && (
                            <>
                                <button
                                    className="fixed inset-0 z-40 cursor-default"
                                    aria-hidden="true"
                                    tabIndex={-1}
                                    onClick={() => setShowOptions(false)}
                                />
                                <div className="absolute right-0 top-full mt-1 z-50 w-56 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg py-1 animate-scale-in">
                                    <button
                                        onClick={() => runOption("viewStarred")}
                                        className="w-full text-left px-3 py-2 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-2"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 shrink-0 text-yellow-500">
                                            <path fillRule="evenodd" d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.006 5.404.434c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.434 2.082-5.005Z" clipRule="evenodd" />
                                        </svg>
                                        Starred messages
                                    </button>
                                    <div className="my-1 border-t border-gray-100 dark:border-gray-800" />
                                    <button
                                        onClick={() => runOption(archived ? "unarchive" : "archive")}
                                        className="w-full text-left px-3 py-2 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-2"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4 shrink-0">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5-.625 11.632a.75.75 0 0 0 0 1.268l20.875 4.132a.75.75 0 0 0 .693-1.264L21.75 7.5M20.25 7.5H3.75" />
                                        </svg>
                                        {archived ? "Unarchive chat" : "Archive chat"}
                                    </button>
                                    <button
                                        onClick={() => runOption(muted ? "unmute" : "mute")}
                                        className="w-full text-left px-3 py-2 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-2"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4 shrink-0">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 9.75 19.5 12m0 0 2.25 2.25M19.5 12l2.25 2.25m-2.25 0-2.25 2.25m-10.5-6 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
                                        </svg>
                                        {muted ? "Unmute chat" : "Mute chat"}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </header>

            {/* ── Messages ────────────────────────────────────────────────── */}
            <div ref={scrollContainerRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 md:px-4 py-3 md:py-4">
                <Chat key={recipient} pendingMessage={pendingMessage} recipient={recipient} recipientUser={recipientUser} scrollContainerRef={scrollContainerRef} setReplyingTo={setReplyingTo} isTyping={isTyping} isRecording={isRecording} />
            </div>

            {/* ── Input ───────────────────────────────────────────────────── */}
            {/* `min-h-0` on the message list above and a `max-h` here are the two
                halves of "the composer must never push itself off screen".

                This wrapper is `shrink-0` inside a fixed-height column
                (`h-full` under `overflow-hidden` on the Inbox root), and the
                composer inside it stacks up to a dozen optional rows — attachment
                chips, reply preview, link preview, poll, voice note, location,
                code mode, banners. Nothing capped it, so it just kept growing: the
                message list absorbed all of it down to zero height, and then the
                overflow was clipped outright by the ancestor `overflow-hidden`.
                The send button and the attach tray went off the bottom of the
                screen with no scrollbar to reach them.

                `max-h` gives the composer a ceiling at just over half the
                viewport, and `overflow-y-auto` means anything past that scrolls
                within the composer instead of vanishing. The messages keep the
                other half — and because that column is `flex-1 min-h-0` it can
                shrink to nothing gracefully rather than forcing the overflow. */}
            {/* overflow-visible so the attach tray (absolute bottom-full inside
                Input) is not clipped by this container. The max-h guard lives
                inside Input itself around the stacked attachment/preview rows;
                the input row and tray are outside that inner scroll so they
                stay reachable at any composer height. */}
            <div className="shrink-0 overflow-visible px-3 md:px-4 py-2.5 md:py-3 border-t border-gray-200 dark:border-gray-800">
                <Input key={recipient} onMessageSent={(msg) => setPendingMessage(msg)} recipient={recipient} replyingTo={replyingTo} setReplyingTo={setReplyingTo} />
            </div>
        </div>
    );
}
