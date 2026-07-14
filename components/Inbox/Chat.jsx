"use client";

import Image from "next/image";
import { useEffect, useRef, useState, useCallback } from "react";
import { useUser } from "@/context/UserContext";
import { useToast } from "@/context/ToastContext";
import ImageLightbox from "@/components/shared/ImageLightbox";
import UserBadges from "@/components/shared/UserBadges";

const RECALL_WINDOW_MS = 60 * 1000;

function Avatar({ sender, color }) {
    return (
        <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold select-none shrink-0"
            style={{ backgroundColor: color }}
        >
            {sender[0].toUpperCase()}
        </div>
    );
}

function TickIcon({ status }) {
    if (status === "sending") {
        return (
            <svg className="w-4 h-4 text-gray-400 dark:text-gray-500 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray="50" strokeDashoffset="10" />
            </svg>
        );
    }

    if (status === "sent") {
        return (
            <svg className="w-4 h-4 text-gray-400 dark:text-gray-500" viewBox="0 0 16 16" fill="currentColor">
                <path d="M12.354 4.354a.5.5 0 0 0-.708-.708L6 9.293 3.854 7.146a.5.5 0 1 0-.708.708l2.5 2.5a.5.5 0 0 0 .708 0l6-6z" />
            </svg>
        );
    }

    if (status === "delivered") {
        return (
            <svg className="w-4 h-4 text-gray-400 dark:text-gray-500" viewBox="0 0 20 16" fill="currentColor">
                <path d="M1.354 4.354a.5.5 0 0 0-.708-.708l-1 1a.5.5 0 0 0 .708.708L1.354 4.354zM5.5 5.646a.5.5 0 0 0-.708-.708l-3 3a.5.5 0 0 0 .708.708l3-3zM7 9.293l1.646-1.647a.5.5 0 0 0-.708-.708L7 8.586 4.854 6.44a.5.5 0 1 0-.708.708l2.5 2.5a.5.5 0 0 0 .708 0l3.5-3.5a.5.5 0 0 0-.708-.708L7 9.293zM13.5 4.354a.5.5 0 0 0-.708-.708l-1 1a.5.5 0 0 0 .708.708l1-1zM17.646 5.646a.5.5 0 0 0-.708-.708l-3 3a.5.5 0 0 0 .708.708l3-3z" />
                <path d="M12.5 9.293l1.646-1.647a.5.5 0 0 0-.708-.708L12.5 8.586l-2.146-2.146a.5.5 0 0 0-.708.708l3 3a.5.5 0 0 0 .354.146.5.5 0 0 0 .146-.354l-3.5-3.5a.5.5 0 0 0-.708-.708L12.5 9.293z" />
            </svg>
        );
    }

    if (status === "read") {
        return (
            <svg className="w-4 h-4 text-blue-500" viewBox="0 0 20 16" fill="currentColor">
                <path d="M1.354 4.354a.5.5 0 0 0-.708-.708l-1 1a.5.5 0 0 0 .708.708L1.354 4.354zM5.5 5.646a.5.5 0 0 0-.708-.708l-3 3a.5.5 0 0 0 .708.708l3-3zM7 9.293l1.646-1.647a.5.5 0 0 0-.708-.708L7 8.586 4.854 6.44a.5.5 0 1 0-.708.708l2.5 2.5a.5.5 0 0 0 .708 0l3.5-3.5a.5.5 0 0 0-.708-.708L7 9.293zM13.5 4.354a.5.5 0 0 0-.708-.708l-1 1a.5.5 0 0 0 .708.708l1-1zM17.646 5.646a.5.5 0 0 0-.708-.708l-3 3a.5.5 0 0 0 .708.708l3-3z" />
                <path d="M12.5 9.293l1.646-1.647a.5.5 0 0 0-.708-.708L12.5 8.586l-2.146-2.146a.5.5 0 0 0-.708.708l3 3a.5.5 0 0 0 .354.146.5.5 0 0 0 .146-.354l-3.5-3.5a.5.5 0 0 0-.708-.708L12.5 9.293z" />
            </svg>
        );
    }

    return null;
}

function getMessageStatus(msg) {
    if (msg._sending) return "sending";
    if (msg.isRead) return "read";
    if (msg.delivered) return "delivered";
    return "sent";
}

export default function Chat({ pendingMessage, recipient, recipientUser, scrollContainerRef }) {
    const { user } = useUser();
    const { showToast } = useToast();
    const [messages, setMessages]   = useState([]);
    const [loading, setLoading]     = useState(true);
    const bottomRef                  = useRef(null);
    const pendingIdRef               = useRef(null);
    const isNearBottomRef            = useRef(true);
    const username                   = user?.username;
    const [lightboxSrc, setLightboxSrc] = useState(null);
    const [showScrollBtn, setShowScrollBtn] = useState(false);
    const [, forceUpdate]            = useState(0);

    const isNearBottom = useCallback(() => {
        const el = scrollContainerRef.current;
        if (!el) return true;
        return el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    }, [scrollContainerRef]);

    const scrollToBottom = useCallback((smooth = true) => {
        bottomRef.current?.scrollIntoView({ behavior: smooth ? "smooth" : "instant" });
    }, []);

    useEffect(() => {
        if (!recipient) return;
        const id = setInterval(() => forceUpdate((n) => n + 1), 10000);
        return () => clearInterval(id);
    }, [recipient]);

    const canRecall = useCallback((msg) => {
        if (msg.sender !== username) return false;
        if (msg._sending) return false;
        const elapsed = Date.now() - new Date(msg.timeStamp).getTime();
        return elapsed < RECALL_WINDOW_MS;
    }, [username]);

    const handleRecall = useCallback(async (msg) => {
        if (!confirm("Recall this message?")) return;
        try {
            const res = await fetch("/api/messages", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ messageId: msg._id, username }),
            });
            if (res.ok) {
                setMessages((prev) => prev.filter((m) => m._id !== msg._id));
                showToast("Message recalled", "success");
            } else {
                const data = await res.json();
                showToast(data.error || "Failed to recall", "error");
            }
        } catch {
            showToast("Failed to recall message", "error");
        }
    }, [username, showToast]);

    const [hasMore, setHasMore] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [oldestTimestamp, setOldestTimestamp] = useState(null);
    const [newMessagesCount, setNewMessagesCount] = useState(0);
    const latestTimestampRef = useRef(null);

    const resetChatState = useCallback(() => {
        setMessages([]);
        setHasMore(false);
        setOldestTimestamp(null);
        setLoading(true);
    }, []);

    const syncPendingMessage = useCallback((pm) => {
        setMessages((prev) => {
            if (pm._remove) {
                return prev.filter((m) => m._id !== pm._id && m._tempId !== pm._tempId);
            }

            if (pm._id && !pm._sending) {
                const exists = prev.some((m) => m._id === pm._id);
                if (exists) {
                    return prev.map((m) => (m._id === pm._id ? { ...m, _sending: false } : m));
                }
                return [...prev, pm];
            }

            const existsTemp = prev.some((m) => m._tempId === pm._tempId);
            if (existsTemp) {
                return prev.map((m) => (m._tempId === pm._tempId ? pm : m));
            }
            return [...prev, pm];
        });

        if (pm._tempId) pendingIdRef.current = pm._tempId;

        if (pm.sender === user?.username) {
            isNearBottomRef.current = true;
            setShowScrollBtn(false);
            requestAnimationFrame(() => scrollToBottom());
        }
    }, [user?.username, scrollToBottom]);

    const resetScrollState = useCallback(() => {
        isNearBottomRef.current = true;
        setShowScrollBtn(false);
    }, []);

    const resetNewMessagesCount = useCallback(() => {
        if (!isNearBottomRef.current && newMessagesCount > 0) return;
        setNewMessagesCount(0);
    }, [newMessagesCount]);

    const fetchMessages = useCallback(async (options = {}) => {
        if (!username || !recipient) return null;
        const params = new URLSearchParams({
            user1: username,
            user2: recipient,
            limit: String(options.limit || 20),
        });
        if (options.before) params.set("before", options.before);

        try {
            const res = await fetch(`/api/messages?${params.toString()}`);
            if (!res.ok) return null;
            const data = await res.json();

            const fetched = Array.isArray(data.messages) ? data.messages : [];
            setHasMore(Boolean(data.hasMore));

            setMessages(prev => {
                const prevMap = new Map(prev.map(m => [m._id, m]));
                const items = fetched.map(m => {
                    const local = prevMap.get(m._id);
                    return local ? { ...m, _sending: local._sending } : m;
                });

                if (options.prepend) {
                    return [...items, ...prev];
                }

                const mergedMap = new Map(prev.map(m => [m._id, m]));
                for (const item of items) {
                    const existing = mergedMap.get(item._id);
                    mergedMap.set(item._id, existing ? { ...item, _sending: existing._sending } : item);
                }
                return Array.from(mergedMap.values()).sort((a, b) => new Date(a.timeStamp) - new Date(b.timeStamp));
            });

            if (fetched.length) {
                const first = fetched[0];
                const last = fetched[fetched.length - 1];
                setOldestTimestamp(first.timeStamp);
                if (!options.prepend) {
                    if (latestTimestampRef.current && !isNearBottomRef.current) {
                        const newCount = fetched.filter((m) => new Date(m.timeStamp) > new Date(latestTimestampRef.current)).length;
                        if (newCount > 0) {
                            setNewMessagesCount((count) => count + newCount);
                        }
                    }
                    latestTimestampRef.current = last.timeStamp;
                }
            }

            if (!options.prepend) {
                await fetch("/api/messages", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ sender: username, recipient }),
                });
            }

            return fetched;
        } catch (err) {
            console.error("Failed to fetch messages:", err);
            return null;
        }
    }, [username, recipient]);

    const loadOlderMessages = useCallback(async () => {
        if (!username || !recipient || !hasMore || loadingMore || !oldestTimestamp) return;
        const el = scrollContainerRef.current;
        const previousScrollTop = el?.scrollTop || 0;
        const previousScrollHeight = el?.scrollHeight || 0;
        setLoadingMore(true);
        try {
            await fetchMessages({ limit: 20, before: oldestTimestamp, prepend: true });
            requestAnimationFrame(() => {
                if (!el) return;
                el.scrollTop = el.scrollHeight - previousScrollHeight + previousScrollTop;
            });
        } finally {
            setLoadingMore(false);
        }
    }, [fetchMessages, hasMore, loadingMore, oldestTimestamp, recipient, scrollContainerRef, username]);

    useEffect(() => {
        if (!recipient) {
            queueMicrotask(() => {
                resetChatState();
                setLoading(false);
            });
            return;
        }

        let cancelled = false;
        queueMicrotask(resetChatState);

        const load = async () => {
            await fetchMessages({ limit: 20 });
            if (!cancelled) setLoading(false);
        };

        load();
        return () => { cancelled = true; };
    }, [fetchMessages, recipient, resetChatState]);

    useEffect(() => {
        if (!recipient) return;
        queueMicrotask(resetScrollState);
    }, [recipient, resetScrollState]);

    useEffect(() => {
        if (!recipient) return;
        const interval = setInterval(fetchMessages, 2000);
        return () => clearInterval(interval);
    }, [fetchMessages, recipient]);

    useEffect(() => {
        if (!pendingMessage) return;
        queueMicrotask(() => syncPendingMessage(pendingMessage));
    }, [pendingMessage, syncPendingMessage]);

    useEffect(() => {
        const el = scrollContainerRef.current;
        if (!el) return;
        const onScroll = () => {
            if (el.scrollTop < 120 && hasMore && !loadingMore) {
                loadOlderMessages();
            }
            const near = isNearBottom();
            isNearBottomRef.current = near;
            setShowScrollBtn(!near);
        };
        el.addEventListener("scroll", onScroll, { passive: true });
        return () => el.removeEventListener("scroll", onScroll);
    }, [hasMore, isNearBottom, loadOlderMessages, loadingMore, scrollContainerRef]);

    useEffect(() => {
        if (isNearBottomRef.current) {
            scrollToBottom();
        }
    }, [messages, scrollToBottom]);

    useEffect(() => {
        resetNewMessagesCount();
    }, [messages, resetNewMessagesCount]);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-gray-400 dark:text-gray-500">
                <div className="w-6 h-6 border-2 border-gray-300 dark:border-gray-700 border-t-gray-500 dark:border-t-gray-400 rounded-full animate-spin" />
                <p className="text-sm">Loading\u2026</p>
            </div>
        );
    }

    if (!recipient) {
        return (
            <div className="flex flex-col items-center justify-center h-full gap-3 select-none">
                <div
                    className="w-20 h-20 rounded-full flex items-center justify-center text-white text-3xl font-bold"
                    style={{ backgroundColor: user?.color || "#3b82f6" }}
                >
                    {user?.username?.[0]?.toUpperCase() ?? "?"}
                </div>
                <p className="font-semibold text-gray-900 dark:text-gray-100">{user?.username}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Select a conversation to start messaging</p>
            </div>
        );
    }

    if (messages.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-full gap-3 select-none">
                <div
                    className="w-20 h-20 rounded-full flex items-center justify-center text-white text-3xl font-bold bg-gray-300 dark:bg-gray-700"
                >
                    {recipient?.[0]?.toUpperCase() ?? "?"}
                </div>
                <p className="font-semibold text-gray-900 dark:text-gray-100">{recipient}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">No messages yet. Say hello</p>
            </div>
        );
    }

    return (
        <div className="relative h-full">
        <div className="flex flex-col gap-0.5 w-full">
            {loadingMore && (
                <div className="flex items-center justify-center py-2">
                    <div className="w-4 h-4 border-2 border-gray-300 dark:border-gray-700 border-t-transparent rounded-full animate-spin" />
                </div>
            )}
            {messages.map((msg, i) => {
                const isMine  = msg.sender === user?.username;
                const isFirst = i === 0;
                const prev    = isFirst ? null : messages[i - 1];
                const next    = i < messages.length - 1 ? messages[i + 1] : null;

                const showTime =
                    isFirst ||
                    new Date(msg.timeStamp) - new Date(prev.timeStamp) > 5 * 60 * 1000;

                const sameAsPrev = prev && prev.sender === msg.sender && !showTime;
                const sameAsNext = next && next.sender === msg.sender &&
                    new Date(next.timeStamp) - new Date(msg.timeStamp) <= 5 * 60 * 1000;

                let rounding;
                if (isMine) {
                    if (!sameAsPrev && !sameAsNext) rounding = "rounded-3xl";
                    else if (!sameAsPrev)           rounding = "rounded-3xl rounded-br-md";
                    else if (!sameAsNext)           rounding = "rounded-3xl rounded-tr-md";
                    else                            rounding = "rounded-3xl rounded-r-md";
                } else {
                    if (!sameAsPrev && !sameAsNext) rounding = "rounded-3xl";
                    else if (!sameAsPrev)           rounding = "rounded-3xl rounded-bl-md";
                    else if (!sameAsNext)           rounding = "rounded-3xl rounded-tl-md";
                    else                            rounding = "rounded-3xl rounded-l-md";
                }

                const tickStatus = isMine ? getMessageStatus(msg) : null;

                return (
                    <div key={msg._id || msg._tempId}>
                        {showTime && (
                            <div className="flex justify-center my-4">
                                <span className="text-xs text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-800 px-3 py-1 rounded-full">
                                    {new Date(msg.timeStamp).toLocaleString([], {
                                        month: "short", day: "numeric",
                                        hour: "2-digit", minute: "2-digit",
                                    })}
                                </span>
                            </div>
                        )}

                        <div className={`flex items-end gap-2 mt-0.5 ${isMine ? "justify-end" : "justify-start"}`}>
                            {!isMine && (
                                <div className="w-7 shrink-0">
                                    {!sameAsNext && <Avatar sender={msg.sender} color={msg.color} />}
                                </div>
                            )}

                            <div className="flex flex-col max-w-[72vw] sm:max-w-xs lg:max-w-md">
                                {!isMine && !sameAsPrev && (
                                    <div className="flex items-center gap-1 mb-1 ml-1">
                                        <span className="text-xs text-gray-500 dark:text-gray-400">{msg.sender}</span>
                                        {msg.sender === recipient && (
                                            <UserBadges isVerified={recipientUser?.isVerified} isAdmin={recipientUser?.isAdmin} roles={recipientUser?.roles || []} size="xs" />
                                        )}
                                    </div>
                                )}
                                <div
                                    className={`overflow-hidden ${rounding} ${
                                        isMine
                                            ? "bg-blue-500 text-white"
                                            : "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                                    }`}
                                >
                                    {msg.imageUrl && (
                                        <button
                                            type="button"
                                            onClick={() => setLightboxSrc(msg.imageUrl)}
                                            className={`block w-full ${msg.text ? "" : "max-w-[300px]"} overflow-hidden rounded-3xl cursor-pointer`}
                                        >
                                            <Image
                                                src={msg.imageUrl}
                                                alt="Photo"
                                                width={600}
                                                height={400}
                                                className="w-full h-auto object-cover"
                                                priority={false}
                                            />
                                        </button>
                                    )}
                                    {msg.text && (
                                        <div className={`px-4 py-2.5 text-sm leading-snug wrap-break-word ${msg.imageUrl ? "border-t border-white/20" : ""}`}>
                                            {msg.text}
                                        </div>
                                    )}
                                </div>
                                {isMine && (
                                    <div className="flex items-center justify-end gap-0.5 mt-0.5 mr-1">
                                        <span className="text-[10px] text-gray-400 dark:text-gray-500">
                                            {new Date(msg.timeStamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                        </span>
                                        <TickIcon status={tickStatus} />
                                        {canRecall(msg) && (
                                            <button
                                                onClick={() => handleRecall(msg)}
                                                className="ml-1 text-[10px] text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 transition-colors font-medium"
                                                title="Recall message"
                                            >
                                                Recall
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                );
            })}
            <div ref={bottomRef} />
        </div>

        {showScrollBtn && (
            <button
                onClick={() => {
                    isNearBottomRef.current = true;
                    setShowScrollBtn(false);
                    scrollToBottom();
                }}
                className="sticky bottom-3 mx-auto w-9 h-9 flex items-center justify-center rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 shadow-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors z-10 ml-auto mr-auto"
                aria-label="Scroll to bottom"
            >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                </svg>
            </button>
        )}

        {newMessagesCount > 0 && (
            <button
                onClick={() => {
                    isNearBottomRef.current = true;
                    setShowScrollBtn(false);
                    setNewMessagesCount(0);
                    scrollToBottom();
                }}
                className="fixed bottom-24 left-1/2 -translate-x-1/2 z-20 rounded-full bg-blue-500 px-4 py-2 text-xs font-semibold text-white shadow-lg hover:bg-blue-600 transition-colors"
            >
                {newMessagesCount} new message{newMessagesCount > 1 ? "s" : ""}
            </button>
        )}

        {lightboxSrc && (
            <ImageLightbox src={lightboxSrc} alt="Photo" onClose={() => setLightboxSrc(null)} />
        )}
        </div>
    );
}
