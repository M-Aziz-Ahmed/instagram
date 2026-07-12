"use client";

import { useState } from "react";

const Input = ({ onMessageSent }) => {
    const [text, setText] = useState("");
    const [sending, setSending] = useState(false);

    const handleSend = async () => {
        if (!text.trim()) return;

        setSending(true);
        try {
            const res = await fetch("/api/messages", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text }),
            });

            if (res.ok) {
                setText("");
                if (onMessageSent) onMessageSent();
            }
        } catch (error) {
            console.error("Failed to send message:", error);
        } finally {
            setSending(false);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <div className="flex items-center gap-2 w-full">
            <input
                type="text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Message..."
                className="border border-gray-300 rounded-full flex-1 text-black px-4 py-2 text-sm outline-none focus:border-gray-500"
            />
            <button
                onClick={handleSend}
                disabled={sending || !text.trim()}
                className="bg-blue-400 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 rounded-full text-sm text-white transition-colors"
            >
                {sending ? "..." : "Send"}
            </button>
        </div>
    );
};

export default Input;
