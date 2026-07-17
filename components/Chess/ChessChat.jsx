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
            <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 flex items-center gap-2">
                <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Chat</h3>
            </div>
            <div ref={listRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5">
                {(!chat || chat.length === 0) && (
                    <div className="flex flex-col items-center justify-center py-8 text-gray-400 dark:text-gray-500">
                        <svg className="w-8 h-8 mb-2 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                        </svg>
                        <p className="text-xs">Say hello!</p>
                    </div>
                )}
                {chat?.map((msg, i) => {
                    const isMe = msg.username === username;
                    return (
                        <div key={i} className={`text-xs ${isMe ? "text-right" : ""}`}>
                            <div className={`inline-block max-w-[85%] ${isMe ? "text-right" : ""}`}>
                                {!isMe && (
                                    <span className="font-semibold" style={{ color: msg.color || "#3b82f6" }}>
                                        {msg.username}
                                        <span className="text-gray-400 dark:text-gray-600 font-normal mx-1">&middot;</span>
                                    </span>
                                )}
                                <span className="text-gray-700 dark:text-gray-300 break-words">{msg.text}</span>
                            </div>
                        </div>
                    );
                })}
            </div>
            <form onSubmit={handleSend} className="flex border-t border-gray-200 dark:border-gray-700">
                <input
                    type="text"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Type a message..."
                    className="flex-1 px-3 py-2.5 text-xs bg-transparent text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none"
                    maxLength={200}
                />
                <button
                    type="submit"
                    disabled={!message.trim()}
                    className="px-3 py-2.5 text-xs font-semibold text-blue-500 hover:text-blue-600 disabled:text-gray-300 dark:disabled:text-gray-600 transition-colors"
                >
                    Send
                </button>
            </form>
        </div>
    );
}
