"use client";

import { useState, useRef, useEffect } from "react";

export default function ChessChat({ chat, onSendMessage, username }) {
    const [message, setMessage] = useState("");
    const listRef = useRef(null);

    useEffect(() => {
        if (listRef.current) {
            listRef.current.scrollTop = listRef.current.scrollHeight;
        }
    }, [chat?.length]);

    const handleSend = (e) => {
        e.preventDefault();
        if (!message.trim()) return;
        onSendMessage?.(message.trim());
        setMessage("");
    };

    return (
        <div className="flex flex-col h-full">
            <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700">
                <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Chat</h3>
            </div>
            <div ref={listRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
                {(!chat || chat.length === 0) && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-4">Say hello!</p>
                )}
                {chat?.map((msg, i) => (
                    <div key={i} className={`text-xs ${msg.username === username ? "text-right" : ""}`}>
                        <span className="font-medium" style={{ color: msg.color || "#3b82f6" }}>
                            {msg.username}
                        </span>
                        <span className="text-gray-400 dark:text-gray-500 ml-1">{msg.text}</span>
                    </div>
                ))}
            </div>
            <form onSubmit={handleSend} className="flex border-t border-gray-200 dark:border-gray-700">
                <input
                    type="text"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Type a message..."
                    className="flex-1 px-3 py-2 text-xs bg-transparent text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none"
                    maxLength={200}
                />
                <button
                    type="submit"
                    disabled={!message.trim()}
                    className="px-3 py-2 text-xs font-medium text-blue-500 hover:text-blue-600 disabled:text-gray-300 dark:disabled:text-gray-600 transition-colors"
                >
                    Send
                </button>
            </form>
        </div>
    );
}
