"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/context/UserContext";

const LIVE_SERVER = process.env.NEXT_PUBLIC_LIVE_SERVER_URL;

/**
 * Shared helper for the game-over screen so players can start a fresh game
 * in-place (without returning to the lobby).
 *
 * @param {string} basePath  e.g. "chess", "hangman"
 * @returns {{ creating: boolean, playAgain: (endpoint: string, extraBody?: object) => Promise<void> }}
 */
export function useGameReplay(basePath) {
    const router = useRouter();
    const { user } = useUser();
    const [creating, setCreating] = useState(false);

    const playAgain = useCallback(
        async (endpoint, extraBody = {}) => {
            if (!user) return;
            setCreating(true);
            try {
                const res = await fetch(`${LIVE_SERVER}${endpoint}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        username: user.username,
                        avatarUrl: user.avatarUrl || "",
                        avatarColor: user.avatarColor || "#a855f7",
                        ...extraBody,
                    }),
                });
                if (res.ok) {
                    const data = await res.json();
                    const id = data?.game?._id || data?.game?.id;
                    if (id) {
                        router.push(`/${basePath}/game/${id}`);
                        return;
                    }
                }
            } catch {
                // fall through to reset creating state
            }
            setCreating(false);
        },
        [user, router, basePath]
    );

    return { creating, playAgain };
}
