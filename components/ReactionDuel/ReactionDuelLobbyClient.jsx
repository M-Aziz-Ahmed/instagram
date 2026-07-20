"use client";

import { useState } from "react";
import { useUser } from "@/context/UserContext";
import { useRouter } from "next/navigation";

const LIVE_SERVER = process.env.NEXT_PUBLIC_LIVE_SERVER_URL;

export default function ReactionDuelLobbyClient() {
    const { user } = useUser();
    const router = useRouter();
    const [creating, setCreating] = useState(false);
    const [joinInput, setJoinInput] = useState("");
    const [joining, setJoining] = useState(false);
    const [error, setError] = useState(null);

    const handleStart = async () => {
        if (!user) return;
        setCreating(true);
        setError(null);
        try {
            const res = await fetch(`${LIVE_SERVER}/api/reactionduel/games`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    username: user.username,
                    avatarUrl: user.avatarUrl || "",
                    avatarColor: user.avatarColor || "#a855f7",
                }),
            });
            if (res.ok) {
                const data = await res.json();
                router.push(`/reactionduel/game/${data.game._id}`);
            } else {
                setError("Could not start a duel");
            }
        } catch (e) {
            setError("Network error");
        }
        setCreating(false);
    };

    const handleJoin = async () => {
        if (!user) return;
        const raw = (joinInput || "").trim();
        if (!raw) return;
        let id = raw;
        const m = raw.match(/game\/([0-9a-fA-F]{24})/);
        if (m) id = m[1];
        id = id.replace(/\/+$/, "");
        if (!/^[0-9a-fA-F]{24}$/.test(id)) {
            setError("Invalid duel link or ID");
            return;
        }
        setJoining(true);
        setError(null);
        try {
            const res = await fetch(`${LIVE_SERVER}/api/reactionduel/games/${id}/join`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    username: user.username,
                    avatarUrl: user.avatarUrl || "",
                    avatarColor: user.avatarColor || "#a855f7",
                }),
            });
            if (res.ok) {
                const data = await res.json();
                router.push(`/reactionduel/game/${data.game._id}`);
            } else {
                const d = await res.json().catch(() => ({}));
                setError(d.error || "Could not join duel");
            }
        } catch (e) {
            setError("Network error");
        }
        setJoining(false);
    };

    return (
        <div className="max-w-4xl mx-auto px-4 py-6">
            <div className="mb-6">
                <h1 className="text-3xl font-extrabold bg-gradient-to-r from-pink-500 via-red-500 to-yellow-500 bg-clip-text text-transparent">Reaction Duel</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Two players. One signal. Tap fastest after GO — but jump early and you lose.</p>
            </div>

            <div className="p-6 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl text-center mb-8">
                <div className="text-5xl mb-3">{"⚡"}</div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Challenge a friend to a real-time reflex duel.</p>
                <button
                    onClick={handleStart}
                    disabled={creating || !user}
                    className="px-6 py-2.5 bg-gradient-to-r from-pink-500 to-red-500 text-white text-sm font-semibold rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                    {creating ? "Creating..." : "New Duel"}
                </button>
            </div>

            <div className="p-6 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl mb-8">
                <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Join a duel</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Paste a duel link or game ID shared by a friend.</p>
                <div className="flex flex-col sm:flex-row gap-2">
                    <input
                        value={joinInput}
                        onChange={(e) => setJoinInput(e.target.value)}
                        placeholder="https://.../reactionduel/game/...  or  game ID"
                        className="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-pink-500"
                    />
                    <button
                        onClick={handleJoin}
                        disabled={joining || !user}
                        className="px-5 py-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-sm font-semibold rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
                    >
                        {joining ? "Joining..." : "Join"}
                    </button>
                </div>
                {error && <p className="mt-3 text-xs text-red-500">{error}</p>}
            </div>

            <div className="p-6 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl">
                <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">How to play</h2>
                <ol className="list-decimal list-inside text-sm text-gray-600 dark:text-gray-400 space-y-1">
                    <li>Create a duel and share the link, or join with a friend&apos;s link.</li>
                    <li>Both players press <span className="font-semibold">Ready</span>.</li>
                    <li>A random delay happens — then <span className="font-semibold">GO</span> appears.</li>
                    <li>Tap <span className="font-semibold">TAP!</span> as fast as you can. First tap wins.</li>
                    <li>Tap before GO and you instantly lose (false start).</li>
                </ol>
            </div>
        </div>
    );
}
