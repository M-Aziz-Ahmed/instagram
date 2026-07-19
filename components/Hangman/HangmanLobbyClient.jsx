"use client";

import { useState } from "react";
import { useUser } from "@/context/UserContext";
import { useRouter } from "next/navigation";
import GameProfileHistory from "@/components/Games/GameProfileHistory";

const LIVE_SERVER = process.env.NEXT_PUBLIC_LIVE_SERVER_URL;

export default function HangmanLobbyClient() {
    const { user } = useUser();
    const router = useRouter();
    const [creating, setCreating] = useState(false);

    const handleStart = async () => {
        if (!user) return;
        setCreating(true);
        try {
            const res = await fetch(`${LIVE_SERVER}/api/hangman/games`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    username: user.username,
                    avatarUrl: user.avatarUrl || "",
                    avatarColor: user.avatarColor || "#a855f7",
                    mode: "ai",
                }),
            });
            if (res.ok) {
                const data = await res.json();
                router.push(`/hangman/game/${data.game._id}`);
            }
        } catch (e) {}
        setCreating(false);
    };

    return (
        <div className="max-w-4xl mx-auto px-4 py-6">
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Hangman</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">Guess the hidden word before the drawing completes</p>
            </div>

            <div className="p-6 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl text-center mb-8">
                <div className="text-5xl mb-3">{"\uD83D\uDD24"}</div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">You get 6 wrong guesses. Solve the word to win!</p>
                <button
                    onClick={handleStart}
                    disabled={creating || !user}
                    className="px-6 py-2.5 bg-purple-500 text-white text-sm font-semibold rounded-lg hover:bg-purple-600 disabled:opacity-50 transition-colors"
                >
                    {creating ? "Starting..." : "New Word"}
                </button>
            </div>

            {user?.username && (
                <GameProfileHistory username={user.username} game="hangman" title="Hangman Games" />
            )}
        </div>
    );
}
