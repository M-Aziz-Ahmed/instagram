"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useUser } from "@/context/UserContext";

function Avatar({ sender, color, size = "sm" }) {
    const dim = size === "sm" ? "w-7 h-7 text-xs" : "w-20 h-20 text-3xl";
    return (
        <div
            className={`${dim} rounded-full flex items-center justify-center text-white font-bold select-none shrink-0`}
            style={{ backgroundColor: color }}
        >
            {sender[0].toUpperCase()}
        </div>
    );
}

export default function Chat({ refreshTrigger }) {
    const { user } = useUser();
    const [messages, setMessages] = useState([]);
    const [loading, setLoading]   = useState(true);
    const bottomRef = useRef(null);
    const esRef     = useRef(null);

    // ── initial load ──────────────────────────────────────────────────────────
    const fetchMessages = useCallback(async () => {
        try {
            const res = await fetch("/api/messages");
            if (res.ok) setMessages(await res.json());
        } catch (err) {
            console.error("Failed to fetch messages:", err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchMessages(); }, [fetchMessages, refreshTrigger]);

    // ── SSE real-time stream ───────────────────────────────────────────────────
    useEffect(() => {
        let es;
        let reconnectTimeout;

        const connect = () => {
            es = new EventSource("/api/messages/stream");
            esRef.current = es;

            es.onmessage = (e) => {
                try {
                    const msg = JSON.parse(e.data);
                    setMessages((prev) => {
                        if (prev.some((m) => m._id === msg._id)) return prev;
                        return [...prev, msg];
                    });
                } catch { /* ignore malformed or heartbeat comments */ }
            };

            es.onerror = () => {
                es.close();
                // Reconnect after 3s
                reconnectTimeout = setTimeout(connect, 3000);
            };
        };

        connect();

        return () => {
            clearTimeout(reconnectTimeout);
            es?.close();
            esRef.current = null;
        };
    }, []);

    // ── auto-scroll ───────────────────────────────────────────────────────────
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    // ── states ────────────────────────────────────────────────────────────────
    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-gray-400">
                <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-500 rounded-full animate-spin" />
                <p className="text-sm">Loading…</p>
            </div>
        );
    }

    if (messages.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-full gap-3 select-none">
                <div
                    className="w-20 h-20 rounded-full flex items-center justify-center text-white text-3xl font-bold"
                    style={{ backgroundColor: user?.color || "#3b82f6" }}
                >
                    {user?.username?.[0]?.toUpperCase() ?? "?"}
                </div>
                <p className="font-semibold text-gray-900">{user?.username}</p>
                <p className="text-sm text-gray-500">No messages yet. Say hello 👋</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-0.5 w-full">
            {messages.map((msg, i) => {
                const isMine   = msg.sender === user?.username;
                const isFirst  = i === 0;
                const prev     = isFirst ? null : messages[i - 1];
                const next     = i < messages.length - 1 ? messages[i + 1] : null;

                // Show timestamp divider when gap > 5 min
                const showTime =
                    isFirst ||
                    new Date(msg.timeStamp) - new Date(prev.timeStamp) > 5 * 60 * 1000;

                // Group consecutive same-sender messages for tighter bubbles
                const sameAsPrev = prev && prev.sender === msg.sender && !showTime;
                const sameAsNext = next && next.sender === msg.sender &&
                    new Date(next.timeStamp) - new Date(msg.timeStamp) <= 5 * 60 * 1000;

                // Rounding: pill on solo, flatten middle/edges of group
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

                return (
                    <div key={msg._id}>
                        {showTime && (
                            <div className="flex justify-center my-4">
                                <span className="text-xs text-gray-400 bg-gray-50 px-3 py-1 rounded-full">
                                    {new Date(msg.timeStamp).toLocaleString([], {
                                        month: "short", day: "numeric",
                                        hour: "2-digit", minute: "2-digit",
                                    })}
                                </span>
                            </div>
                        )}

                        <div className={`flex items-end gap-2 mt-0.5 ${isMine ? "justify-end" : "justify-start"}`}>
                            {/* Received: show avatar only on last in group */}
                            {!isMine && (
                                <div className="w-7 shrink-0">
                                    {!sameAsNext && <Avatar sender={msg.sender} color={msg.color} />}
                                </div>
                            )}

                            <div className="flex flex-col max-w-[72vw] sm:max-w-xs lg:max-w-md">
                                {/* Sender name above first bubble in a group (received only) */}
                                {!isMine && !sameAsPrev && (
                                    <span className="text-xs text-gray-500 mb-1 ml-1">{msg.sender}</span>
                                )}
                                <div
                                    className={`px-4 py-2.5 text-sm leading-snug wrap-break-word ${rounding} ${
                                        isMine
                                            ? "bg-blue-500 text-white"
                                            : "bg-gray-100 text-gray-900"
                                    }`}
                                >
                                    {msg.text}
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })}
            <div ref={bottomRef} />
        </div>
    );
}
