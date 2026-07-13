"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useUser } from "@/context/UserContext";

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

export default function Chat({ pendingMessage, recipient }) {
    const { user } = useUser();
    const [messages, setMessages]   = useState([]);
    const [loading, setLoading]     = useState(true);
    const bottomRef                  = useRef(null);
    const pendingIdRef               = useRef(null);
    const initialLoadDone            = useRef(false);

    const fetchMessages = useCallback(async () => {
        if (!user || !recipient) return;
        try {
            const res = await fetch(`/api/messages?user1=${encodeURIComponent(user.username)}&user2=${encodeURIComponent(recipient)}`);
            if (!res.ok) return;
            const data = await res.json();

            setMessages(prev => {
                const prevMap = new Map(prev.map(m => [m._id, m]));
                return data.map(m => {
                    const local = prevMap.get(m._id);
                    if (local) {
                        return { ...m, _sending: local._sending };
                    }
                    return m;
                });
            });
        } catch (err) {
            console.error("Failed to fetch messages:", err);
        } finally {
            setLoading(false);
        }
    }, [user, recipient]);

    useEffect(() => {
        if (!recipient) {
            setMessages([]);
            setLoading(false);
            initialLoadDone.current = false;
            return;
        }
        if (!initialLoadDone.current) setLoading(true);
        fetchMessages();
        initialLoadDone.current = true;
    }, [fetchMessages, recipient]);

    useEffect(() => {
        if (!recipient) return;
        const interval = setInterval(fetchMessages, 2000);
        return () => clearInterval(interval);
    }, [fetchMessages, recipient]);

    useEffect(() => {
        if (!pendingMessage) return;
        const pm = pendingMessage;

        setMessages(prev => {
            if (pm._remove) {
                return prev.filter(m => m._id !== pm._id && m._tempId !== pm._tempId);
            }

            if (pm._id && !pm._sending) {
                const exists = prev.some(m => m._id === pm._id);
                if (exists) {
                    return prev.map(m => m._id === pm._id ? { ...m, _sending: false } : m);
                }
                return [...prev, pm];
            }

            const existsTemp = prev.some(m => m._tempId === pm._tempId);
            if (existsTemp) {
                return prev.map(m => m._tempId === pm._tempId ? pm : m);
            }
            return [...prev, pm];
        });

        if (pm._tempId) pendingIdRef.current = pm._tempId;
    }, [pendingMessage]);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

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
        <div className="flex flex-col gap-0.5 w-full">
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
                                    <span className="text-xs text-gray-500 dark:text-gray-400 mb-1 ml-1">{msg.sender}</span>
                                )}
                                <div
                                    className={`px-4 py-2.5 text-sm leading-snug wrap-break-word ${rounding} ${
                                        isMine
                                            ? "bg-blue-500 text-white"
                                            : "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                                    }`}
                                >
                                    {msg.text}
                                </div>
                                {isMine && (
                                    <div className="flex items-center justify-end gap-0.5 mt-0.5 mr-1">
                                        <span className="text-[10px] text-gray-400 dark:text-gray-500">
                                            {new Date(msg.timeStamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                        </span>
                                        <TickIcon status={tickStatus} />
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                );
            })}
            <div ref={bottomRef} />
        </div>
    );
}
