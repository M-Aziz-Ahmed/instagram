"use client";

import { useEffect, useRef, useState, useCallback } from "react";

const Chat = ({ refreshTrigger }) => {
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(true);
    const bottomRef = useRef(null);

    const fetchMessages = useCallback(async () => {
        try {
            const res = await fetch("/api/messages");
            if (res.ok) {
                const data = await res.json();
                setMessages(data);
            }
        } catch (error) {
            console.error("Failed to fetch messages:", error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchMessages();
    }, [fetchMessages, refreshTrigger]);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

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
                <div className="w-20 h-20 rounded-full bg-linear-to-br from-purple-400 via-pink-400 to-orange-400 flex items-center justify-center text-white text-3xl font-semibold">
                    A
                </div>
                <p className="font-semibold text-gray-900">azizahmed1</p>
                <p className="text-sm text-gray-500">No messages yet. Say hello 👋</p>
            </div>
        );
    }

    // Group messages so consecutive ones from same side share spacing
    return (
        <div className="flex flex-col gap-1 w-full">
            {messages.map((msg, i) => {
                const isFirst = i === 0;
                const prevMsg = !isFirst ? messages[i - 1] : null;
                const showTimestamp =
                    isFirst ||
                    new Date(msg.timeStamp) - new Date(prevMsg.timeStamp) > 5 * 60 * 1000;

                return (
                    <div key={msg._id}>
                        {showTimestamp && (
                            <div className="flex justify-center my-3">
                                <span className="text-xs text-gray-400">
                                    {new Date(msg.timeStamp).toLocaleString([], {
                                        month: "short",
                                        day: "numeric",
                                        hour: "2-digit",
                                        minute: "2-digit",
                                    })}
                                </span>
                            </div>
                        )}
                        {/* All messages are "sent" (right-aligned) for now — single user */}
                        <div className="flex justify-end">
                            <div
                                className="max-w-xs lg:max-w-md px-4 py-2.5 rounded-3xl bg-blue-500 text-white text-sm leading-snug"
                                style={{ wordBreak: "break-word" }}
                            >
                                {msg.text}
                            </div>
                        </div>
                    </div>
                );
            })}
            <div ref={bottomRef} />
        </div>
    );
};

export default Chat;
