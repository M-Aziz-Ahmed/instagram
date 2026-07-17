"use client";

import Image from "next/image";
import { useEffect, useRef, useState, useCallback } from "react";
import { useUser } from "@/context/UserContext";
import { useToast } from "@/context/ToastContext";
import ImageLightbox from "@/components/shared/ImageLightbox";
import UserBadges from "@/components/shared/UserBadges";
import AudioPlayer from "@/components/shared/AudioPlayer";
import RichText from "@/components/Feed/RichText";

const RECALL_WINDOW_MS = 60 * 1000;

const MSG_REACTIONS = [
    { type: "like", emoji: "👍" },
    { type: "love", emoji: "❤️" },
    { type: "laugh", emoji: "😂" },
    { type: "fire", emoji: "🔥" },
    { type: "sad", emoji: "😢" },
    { type: "angry", emoji: "😠" },
];

const lastReadKey = (user1, user2) => `chat_read:${[user1, user2].sort().join(":")}`;

function getLastReadId(user1, user2) {
    try { return localStorage.getItem(lastReadKey(user1, user2)); } catch { return null; }
}

function setLastReadId(user1, user2, msgId) {
    try { localStorage.setItem(lastReadKey(user1, user2), msgId); } catch {}
}

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
            <svg className="w-4 h-4 text-gray-500 dark:text-gray-400" viewBox="0 0 16 16" fill="currentColor">
                <path d="M12.354 4.354a.5.5 0 0 0-.708-.708L6 9.293 3.854 7.146a.5.5 0 1 0-.708.708l2.5 2.5a.5.5 0 0 0 .708 0l6-6z" />
            </svg>
        );
    }

    if (status === "delivered") {
        return (
            <svg className="w-[18px] h-[18px] text-gray-600 dark:text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                {/* First checkmark */}
                <path d="M20 6L9 17l-5-5" />
                {/* Second checkmark slightly offset */}
                <path d="M23 6L12 17" />
            </svg>
        );
    }

    if (status === "read") {
        return (
            <svg className="w-[18px] h-[18px] text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                {/* First checkmark */}
                <path d="M20 6L9 17l-5-5" />
                {/* Second checkmark slightly offset */}
                <path d="M23 6L12 17" />
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

export default function Chat({ pendingMessage, recipient, recipientUser, scrollContainerRef, replyingTo, setReplyingTo }) {
    const { user } = useUser();
    const { showToast } = useToast();
    const [messages, setMessages]   = useState([]);
    const [loading, setLoading]     = useState(true);
    const bottomRef                  = useRef(null);
    const pendingIdRef               = useRef(null);
    const isNearBottomRef            = useRef(true);
    const scrolledToLastReadRef      = useRef(false);
    const username                   = user?.username;
    const [lightboxSrc, setLightboxSrc] = useState(null);
    const [showScrollBtn, setShowScrollBtn] = useState(false);
    const [translations, setTranslations] = useState({});
    const [translatingIdx, setTranslatingIdx] = useState(null);
    const autoTranslatingRef = useRef(new Set());

    const isNearBottom = useCallback(() => {
        const el = scrollContainerRef.current;
        if (!el) return true;
        return el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    }, [scrollContainerRef]);

    const scrollToBottom = useCallback((smooth = true) => {
        bottomRef.current?.scrollIntoView({ behavior: smooth ? "smooth" : "instant" });
    }, []);

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

    const translateMessage = async (idx, text) => {
        if (translations[idx]) {
            setTranslations((prev) => { const n = { ...prev }; delete n[idx]; return n; });
            return;
        }
        setTranslatingIdx(idx);
        try {
            const res = await fetch("/api/translate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text, target: user?.language || "en" }),
            });
            const data = await res.json();
            if (data.translatedText) {
                setTranslations((prev) => ({ ...prev, [idx]: data.translatedText }));
            }
        } catch {}
        setTranslatingIdx(null);
    };

    const handleReactMessage = useCallback(async (msgId, reactionType) => {
        if (!username) return;
        setMessages(prev => prev.map(m => {
            if (m._id !== msgId) return m;
            const reactions = m.reactions ? { ...m.reactions } : {};
            for (const type of MSG_REACTIONS.map(r => r.type)) {
                if (!reactions[type]) reactions[type] = [];
                const idx = reactions[type].indexOf(username);
                if (idx !== -1) reactions[type] = reactions[type].filter(u => u !== username);
            }
            if (!reactions[reactionType]) reactions[reactionType] = [];
            const idx = reactions[reactionType].indexOf(username);
            if (idx === -1) reactions[reactionType] = [...reactions[reactionType], username];
            return { ...m, reactions };
        }));
        try {
            await fetch("/api/messages", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sender: username, messageId: msgId, action: "react", reactionType }),
            });
        } catch {}
    }, [username]);

    useEffect(() => {
        if (!user?.autoTranslate || !username) return;
        messages.forEach((msg) => {
            if (msg.sender === username) return;
            if (!msg.text) return;
            if (translations[msg._id]) return;
            if (autoTranslatingRef.current.has(msg._id)) return;
            autoTranslatingRef.current.add(msg._id);
            fetch("/api/translate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text: msg.text, target: user?.language || "en" }),
            }).then((r) => r.json()).then((data) => {
                if (data.translatedText && data.translatedText !== msg.text) {
                    setTranslations((prev) => ({ ...prev, [msg._id]: data.translatedText }));
                }
            }).catch(() => {});
        });
    }, [messages, user?.autoTranslate, user?.language, username]);

    const [hasMore, setHasMore] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [oldestTimestamp, setOldestTimestamp] = useState(null);
    const [newMessagesCount, setNewMessagesCount] = useState(0);
    const latestTimestampRef = useRef(null);
    const isLoadingOlderRef = useRef(false);

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
                if (pm.sender === user?.username && username && recipient) {
                    setLastReadId(username, recipient, pm._id);
                }
                const tempIndex = prev.findIndex((m) => m._tempId && m.sender === pm.sender && m.text === pm.text && m.imageUrl === pm.imageUrl);
                if (tempIndex !== -1) {
                    const copy = prev.slice();
                    copy[tempIndex] = pm;
                    return copy;
                }

                const exists = prev.some((m) => m._id === pm._id);
                if (exists) {
                    return prev.map((m) => (m._id === pm._id ? { ...m, _sending: false } : m));
                }
                return [...prev, pm];
            }

            if (pm._tempId) {
                const existsTemp = prev.some((m) => m._tempId === pm._tempId);
                if (existsTemp) {
                    return prev.map((m) => (m._tempId === pm._tempId ? pm : m));
                }
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
        if (user?.autoTranslate && user?.language) {
            params.set("lang", user.language);
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        try {
            const res = await fetch(`/api/messages?${params.toString()}`, {
                credentials: 'include',
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            
            if (!res.ok) return null;
            const data = await res.json();

            const fetched = Array.isArray(data.messages) ? data.messages : [];
            setHasMore(Boolean(data.hasMore));

            if (data.translations) {
                setTranslations((prev) => ({ ...prev, ...data.translations }));
            }

            setMessages(prev => {
                const keyOf = (m) => m._id || m._tempId;

                // If prepending (loading older), just prepend without re-sorting
                if (options.prepend) {
                    const prevIds = new Set(prev.map(keyOf));
                    const newItems = fetched.filter(m => !prevIds.has(keyOf(m)));
                    return [...newItems, ...prev];
                }

                // For polling (append/update), merge intelligently
                const prevMap = new Map(prev.map(m => [keyOf(m), m]));
                const items = fetched.map(m => {
                    const local = prevMap.get(m._id);
                    return local ? { ...m, _sending: local._sending } : m;
                });

                const mergedMap = new Map(prev.map(m => [keyOf(m), m]));
                for (const item of items) {
                    const existing = mergedMap.get(item._id);
                    mergedMap.set(item._id, existing ? { ...item, _sending: existing._sending } : item);
                }
                
                // Sort only when not prepending
                return Array.from(mergedMap.values()).sort((a, b) => new Date(a.timeStamp) - new Date(b.timeStamp));
            });

            if (fetched.length) {
                const first = fetched[0];
                const last = fetched[fetched.length - 1];
                
                if (options.prepend) {
                    // Update oldest timestamp only when loading older messages
                    setOldestTimestamp(first.timeStamp);
                } else {
                    // Initial load or polling
                    setOldestTimestamp(prevOldest => prevOldest || first.timeStamp);
                    
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
                    credentials: 'include',
                    body: JSON.stringify({ sender: username, recipient }),
                }).catch(() => {});
            }

            return fetched;
        } catch (err) {
            if (err.name === 'AbortError') {
                console.warn("Message fetch timed out");
            } else {
                console.error("Failed to fetch messages:", err);
            }
            return null;
        }
    }, [username, recipient, user?.autoTranslate, user?.language]);

    const loadOlderMessages = useCallback(async () => {
        if (!username || !recipient || !hasMore || loadingMore || !oldestTimestamp) return;
        const el = scrollContainerRef.current;
        const previousScrollTop = el?.scrollTop || 0;
        const previousScrollHeight = el?.scrollHeight || 0;
        
        setLoadingMore(true);
        isLoadingOlderRef.current = true;
        
        try {
            await fetchMessages({ limit: 20, before: oldestTimestamp, prepend: true });
            requestAnimationFrame(() => {
                if (!el) return;
                el.scrollTop = el.scrollHeight - previousScrollHeight + previousScrollTop;
                // Keep isLoadingOlderRef true for a bit longer to prevent auto-scroll
                setTimeout(() => {
                    isLoadingOlderRef.current = false;
                }, 300);
            });
        } catch (err) {
            isLoadingOlderRef.current = false;
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
        scrolledToLastReadRef.current = false;

        const load = async () => {
            const result = await fetchMessages({ limit: 20 });
            if (!cancelled) {
                setLoading(false);
                if (result === null) {
                    setMessages([]);
                }
            }
        };

        load();
        return () => { cancelled = true; };
    }, [fetchMessages, recipient, resetChatState]);

    useEffect(() => {
        if (!recipient) return;
        queueMicrotask(resetScrollState);
    }, [recipient, resetScrollState]);

    // Use ref to avoid recreating interval when fetchMessages changes
    const fetchMessagesRef = useRef(fetchMessages);
    useEffect(() => {
        fetchMessagesRef.current = fetchMessages;
    }, [fetchMessages]);

    useEffect(() => {
        if (!recipient) return;
        const interval = setInterval(() => {
            fetchMessagesRef.current();
        }, 8000); // Increased from 5s to 8s
        return () => clearInterval(interval);
    }, [recipient]);

    useEffect(() => {
        if (!pendingMessage) return;
        queueMicrotask(() => syncPendingMessage(pendingMessage));
    }, [pendingMessage, syncPendingMessage]);

    useEffect(() => {
        const el = scrollContainerRef.current;
        if (!el) return;
        
        let scrollTimeout;
        const onScroll = () => {
            if (el.scrollTop < 120 && hasMore && !loadingMore) {
                if (scrollTimeout) clearTimeout(scrollTimeout);
                scrollTimeout = setTimeout(() => {
                    loadOlderMessages();
                }, 150);
            }
            
            const near = isNearBottom();
            isNearBottomRef.current = near;
            setShowScrollBtn(!near);

            if (username && recipient) {
                const containerRect = el.getBoundingClientRect();
                let bottomMostId = null;
                el.querySelectorAll("[id^='msg-']").forEach((msgEl) => {
                    const rect = msgEl.getBoundingClientRect();
                    if (rect.top < containerRect.bottom) {
                        bottomMostId = msgEl.id.replace("msg-", "");
                    }
                });
                if (bottomMostId) setLastReadId(username, recipient, bottomMostId);
            }
        };
        
        el.addEventListener("scroll", onScroll, { passive: true });
        return () => {
            el.removeEventListener("scroll", onScroll);
            if (scrollTimeout) clearTimeout(scrollTimeout);
        };
    }, [hasMore, isNearBottom, loadOlderMessages, loadingMore, scrollContainerRef, username, recipient]);

    useEffect(() => {
        if (!username || !recipient || loading) return;

        if (!scrolledToLastReadRef.current) {
            scrolledToLastReadRef.current = true;
            const lastReadId = getLastReadId(username, recipient);
            if (lastReadId) {
                const el = document.getElementById(`msg-${lastReadId}`);
                if (el) {
                    el.scrollIntoView({ behavior: "instant", block: "center" });
                    return;
                }
            }
            scrollToBottom(false);
            return;
        }

        if (isNearBottomRef.current && !isLoadingOlderRef.current) {
            scrollToBottom();
        }
    }, [messages, scrollToBottom, username, recipient, loading]);

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
                    <div key={msg._id || msg._tempId} id={msg._id ? `msg-${msg._id}` : undefined}>
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

                                {msg.replyTo && (
                                    <div className={`mb-1 px-3 py-1.5 rounded-2xl text-xs border-l-3 ${
                                        isMine
                                            ? "bg-blue-600/30 border-blue-300 text-blue-100"
                                            : "bg-gray-200 dark:bg-gray-700 border-gray-400 dark:border-gray-500 text-gray-600 dark:text-gray-300"
                                    }`}>
                                        <p className="font-semibold text-[10px] truncate">{msg.replyTo.sender}</p>
                                        <p className="truncate opacity-70">{msg.replyTo.text}</p>
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
                                    {msg.audioUrl && !msg.text && !msg.imageUrl && (
                                        <div className="p-1">
                                            <AudioPlayer src={msg.audioUrl} isMine={isMine} />
                                        </div>
                                    )}
                                    {msg.text && (
                                        <div className={`px-4 py-2.5 text-sm leading-snug wrap-break-word ${msg.imageUrl ? "border-t border-white/20" : ""}`}>
                                            <RichText text={msg.text} className="text-inherit" />
                                        </div>
                                    )}
                                </div>

                                {translations[msg._id] && (
                                    <div className={`mt-0.5 px-3 py-1.5 rounded-2xl text-xs italic ${
                                        isMine
                                            ? "bg-blue-600/20 text-blue-100"
                                            : "bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
                                    }`}>
                                        {translations[msg._id]}
                                    </div>
                                )}

                                <div className={`flex items-center gap-1 mt-0.5 ${isMine ? "justify-end mr-1" : "justify-start ml-1"}`}>
                                    <button
                                        onClick={() => setReplyingTo(msg)}
                                        className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors opacity-60 hover:opacity-100"
                                        title="Reply">
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-3.5 h-3.5">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" />
                                        </svg>
                                    </button>
                                    {msg.text && (
                                        <button
                                            onClick={() => translateMessage(msg._id, msg.text)}
                                            className={`p-1 rounded-full transition-colors ${
                                                translations[msg._id]
                                                    ? "bg-blue-100 dark:bg-blue-900/30 text-blue-500 opacity-100"
                                                    : "hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 opacity-60 hover:opacity-100"
                                            }`}
                                            title={translations[msg._id] ? "Hide translation" : "Translate"}>
                                            {translatingIdx === msg._id ? (
                                                <div className="w-3.5 h-3.5 border-2 border-gray-300 dark:border-gray-600 border-t-gray-600 dark:border-t-gray-300 rounded-full animate-spin" />
                                            ) : (
                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-3.5 h-3.5">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="m10.5 21 5.25-11.25L21 21m-9-3h7.5M3 5.621a48.474 48.474 0 0 1 6-.371m0 0c1.12 0 2.233.038 3.334.114M9 5.25V3m3.334 2.364C11.176 10.658 7.69 15.08 3 17.502m9.334-12.138c.896.061 1.785.147 2.666.257m-4.589 8.495a18.023 18.023 0 0 1-3.827-5.802" />
                                                </svg>
                                            )}
                                        </button>
                                    )}
                                    {isMine && (
                                        <>
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
                                        </>
                                    )}
                                    {!isMine && (
                                        <span className="text-[10px] text-gray-400 dark:text-gray-500">
                                            {new Date(msg.timeStamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                        </span>
                                    )}
                                </div>
                                {msg.reactions && (() => {
                                    const counts = MSG_REACTIONS
                                        .map(r => ({ ...r, count: msg.reactions[r.type]?.length || 0, users: msg.reactions[r.type] || [] }))
                                        .filter(r => r.count > 0);
                                    const myReaction = MSG_REACTIONS.find(r => msg.reactions[r.type]?.includes(username));
                                    if (counts.length === 0 && !myReaction) return null;
                                    return (
                                        <div className={`flex items-center gap-1 mt-0.5 flex-wrap ${isMine ? "justify-end mr-1" : "justify-start ml-1"}`}>
                                            {counts.map(r => (
                                                <button
                                                    key={r.type}
                                                    onClick={() => handleReactMessage(msg._id, r.type)}
                                                    className={`inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full transition-colors ${
                                                        myReaction?.type === r.type
                                                            ? "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                                                            : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                                                    }`}
                                                >
                                                    <span>{r.emoji}</span>
                                                    <span>{r.count}</span>
                                                </button>
                                            ))}
                                        </div>
                                    );
                                })()}
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
