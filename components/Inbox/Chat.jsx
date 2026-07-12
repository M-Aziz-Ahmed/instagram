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
        return <p className="text-gray-400 text-sm text-center">Loading messages...</p>;
    }

    if (messages.length === 0) {
        return <p className="text-gray-400 text-sm text-center">No messages yet. Say hello!</p>;
    }

    return (
        <div className="flex flex-col gap-2 w-full overflow-y-auto">
            {messages.map((msg) => (
                <div
                    key={msg._id}
                    className="bg-blue-100 rounded-2xl px-4 py-2 max-w-xs self-end"
                >
                    <p className="text-sm text-gray-800">{msg.text}</p>
                    <p className="text-xs text-gray-400 mt-1 text-right">
                        {new Date(msg.timeStamp).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                        })}
                    </p>
                </div>
            ))}
            <div ref={bottomRef} />
        </div>
    );
};

export default Chat;
