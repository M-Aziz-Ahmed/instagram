"use client";

import { useState, useEffect, useSyncExternalStore } from "react";
import { useUser } from "@/context/UserContext";
import { useRouter } from "next/navigation";
import Link from "next/link";

// `window.location.href` is not readable on the server, and the old
// `typeof window !== "undefined" ? window.location.href : ""` guard only
// protected the server render: the first *client* render already had `window`
// and produced a full URL where the server had produced "", so the two trees
// disagreed. `useSyncExternalStore` is the supported way to read a
// browser-only value — the third argument is what the server renders and what
// the hydration pass compares against, and the value is only swapped for the
// real one afterwards. It never changes while the page is open, so the
// no-op subscription is all that is needed.
const subscribeToLocation = () => () => {};
const getLocationHref = () => (typeof window === "undefined" ? "" : window.location.href);
const getServerHref = () => "";

export default function ChessChallengeClient({ gameId }) {
    const { user } = useUser();
    const router = useRouter();
    const [game, setGame] = useState(null);
    const [loading, setLoading] = useState(true);
    const [joining, setJoining] = useState(false);
    const [error, setError] = useState(null);
    // The role the server assigned on POST /spectate. Preferred over anything
    // inferred from the payload, because only the server knows whether this
    // user is one of the two players or merely watching.
    const [role, setRole] = useState(null);
    const shareLink = useSyncExternalStore(subscribeToLocation, getLocationHref, getServerHref);

    useEffect(() => {
        async function fetchGame() {
            try {
                const res = await fetch(`/api/chess/games/${gameId}`);
                if (res.ok) {
                    const data = await res.json();
                    setGame(data.game);
                } else if (res.status === 401) {
                    // The chess REST routes now require a session, so an
                    // unauthenticated visitor to a shared challenge link gets a
                    // 401. Saying "Challenge not found" was actively wrong — it
                    // exists, the reader just is not signed in.
                    setError("Log in to open this challenge");
                } else if (res.status === 403) {
                    setError("You are not a player in this challenge");
                } else {
                    setError("Challenge not found");
                }
            } catch {
                setError("Failed to load challenge");
            }
            setLoading(false);
        }
        fetchGame();
    }, [gameId]);

    useEffect(() => {
        // Nothing told an open challenge page that the other player had
        // accepted, so a creator watched "Waiting for X to accept..." for ever
        // on a game that was already live. Re-fetch while the game is still
        // waiting; the effect tears itself down as soon as `status` changes,
        // which is what flips the page to "Go to Game". Ticks that land while
        // the tab is hidden are skipped, so a backgrounded tab stops polling.
        if (game?.status !== "waiting") return;
        let cancelled = false;
        const poll = async () => {
            if (document.hidden) return;
            try {
                const res = await fetch(`/api/chess/games/${gameId}`);
                if (!res.ok) return;
                const data = await res.json();
                if (!cancelled && data.game) setGame(data.game);
            } catch {
                // Keep the last known state; the next tick retries.
            }
        };
        const id = setInterval(poll, 10000);
        return () => {
            cancelled = true;
            clearInterval(id);
        };
    }, [gameId, game?.status]);

    const handleJoinChallenge = async () => {
        if (!user) return;
        setJoining(true);
        try {
            const res = await fetch(`/api/chess/games/${gameId}/join`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    username: user.username,
                    avatarUrl: user.avatarUrl || "",
                    avatarColor: user.avatarColor || "#3b82f6",
                }),
            });
            if (res.ok) {
                router.push(`/chess/game/${gameId}`);
            } else {
                const data = await res.json();
                setError(data.error || "Failed to join");
            }
        } catch {
            setError("Failed to join challenge");
        }
        setJoining(false);
    };

    const handleSpectate = async () => {
        if (!user) return;
        setJoining(true);
        try {
            const res = await fetch(`/api/chess/games/${gameId}/spectate`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    username: user.username,
                    avatarUrl: user.avatarUrl || "",
                    avatarColor: user.avatarColor || "#3b82f6",
                }),
            });
            if (res.ok) {
                const data = await res.json();
                // Take the role the server decided on instead of re-deriving
                // "spectator" from the absence of a colour in the payload, which
                // could not tell a player apart from a watcher.
                if (data?.role) setRole(data.role);
                if (data?.game) setGame(data.game);
                router.push(`/chess/game/${gameId}`);
            } else {
                // The one failure a user hits here is a 400 "Game not started
                // yet" — they opened the challenge page early. It used to leave
                // the button re-enabled with nothing to explain the refusal.
                const data = await res.json().catch(() => null);
                setError(data?.error || "Failed to spectate");
            }
        } catch {
            setError("Failed to spectate");
        }
        setJoining(false);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="text-center">
                    <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                    <p className="text-xs text-gray-400">Loading challenge...</p>
                </div>
            </div>
        );
    }

    if (error || !game) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="text-center">
                    <div className="w-12 h-12 rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center mx-auto mb-3">
                        <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                        </svg>
                    </div>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">{error}</p>
                    <a href="/chess" className="text-xs text-blue-500 hover:underline">Back to Chess</a>
                </div>
            </div>
        );
    }

    const isCreator = game.white.username === user?.username;
    const isInvited = game.challengeFor === user?.username;
    const isWaiting = game.status === "waiting";
    // Once /spectate has answered, its `role` is authoritative — the username
    // comparison is only the fallback for players who never had to spectate.
    const isPlayer = role
        ? role === "player"
        : game.white.username === user?.username || game.black.username === user?.username;
    const timeControl = game.timeControl;
    // The first access was optional-chained but the second was not, so a game
    // stored without a timeControl threw a TypeError on this render and took
    // the whole page down with it. Make the second read safe too, and fall back
    // to plain text rather than printing "NaN min".
    const tcLabel = timeControl?.increment > 0
        ? `${timeControl.initial / 60} + ${timeControl.increment}`
        : `${timeControl?.initial / 60} min`;
    const tcText = timeControl?.initial ? tcLabel : "Time control unknown";

    return (
        <div className="max-w-md mx-auto px-4 py-12">
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 text-center">
                <div className="text-4xl mb-3">♟️</div>
                <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-1">Chess Challenge</h1>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-6">{tcText} · vs Player</p>

                <div className="flex items-center justify-center gap-4 mb-6">
                    <div className="text-center">
                        <div className="w-14 h-14 rounded-full flex items-center justify-center text-white font-bold text-lg mx-auto mb-1.5" style={{ backgroundColor: game.white.avatarColor || "#3b82f6" }}>
                            {game.white.avatarUrl ? (
                                <img src={game.white.avatarUrl} alt="" className="w-full h-full object-cover rounded-full" />
                            ) : (
                                game.white.username?.[0]?.toUpperCase() || "?"
                            )}
                        </div>
                        <p className="text-xs font-medium text-gray-900 dark:text-gray-100">{game.white.username || "Waiting..."}</p>
                        <p className="text-[10px] text-gray-400">White</p>
                    </div>
                    <span className="text-lg font-bold text-gray-400 dark:text-gray-600">vs</span>
                    <div className="text-center">
                        <div className="w-14 h-14 rounded-full flex items-center justify-center text-white font-bold text-lg mx-auto mb-1.5" style={{ backgroundColor: game.black?.avatarColor || "#374151" }}>
                            {game.black?.avatarUrl ? (
                                <img src={game.black.avatarUrl} alt="" className="w-full h-full object-cover rounded-full" />
                            ) : (
                                game.black?.username?.[0]?.toUpperCase() || "?"
                            )}
                        </div>
                        <p className="text-xs font-medium text-gray-900 dark:text-gray-100">{game.black?.username || "Waiting..."}</p>
                        <p className="text-[10px] text-gray-400">Black</p>
                    </div>
                </div>

                {isWaiting && isInvited && (
                    <div className="space-y-2">
                        <p className="text-xs text-blue-500 font-medium mb-3">{game.white.username} challenged you!</p>
                        <button
                            onClick={handleJoinChallenge}
                            disabled={joining || !user}
                            className="w-full px-4 py-2.5 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-xl transition-colors shadow-md text-sm disabled:opacity-50"
                        >
                            {joining ? "Joining..." : "Accept Challenge"}
                        </button>
                        <Link href="/chess" className="block w-full px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors">
                            Decline
                        </Link>
                    </div>
                )}

                {isWaiting && !isInvited && !isCreator && (
                    <div className="space-y-2">
                        <p className="text-xs text-gray-500 mb-3">This challenge is for {game.challengeFor || "someone else"}</p>
                        <Link href="/chess" className="block w-full px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors">
                            Back to Chess
                        </Link>
                    </div>
                )}

                {isWaiting && isCreator && (
                    <div className="space-y-2">
                        <div className="flex items-center justify-center gap-1.5 mb-3">
                            <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
                            <p className="text-xs text-blue-500 font-medium">Waiting for {game.challengeFor || "opponent"} to accept...</p>
                        </div>
                        <p className="text-[10px] text-gray-400 mb-2 break-all">Challenge link: {shareLink}</p>
                        <button
                            onClick={() => { if (shareLink) navigator.clipboard?.writeText(shareLink); }}
                            className="w-full px-4 py-2 text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
                        >
                            Copy Link
                        </button>
                        <Link href="/chess" className="block w-full px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors">
                            Back to Chess
                        </Link>
                    </div>
                )}

                {!isWaiting && isPlayer && (
                    <button
                        onClick={() => router.push(`/chess/game/${gameId}`)}
                        className="w-full px-4 py-2.5 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-xl transition-colors shadow-md text-sm"
                    >
                        Go to Game
                    </button>
                )}

                {!isWaiting && !isPlayer && (
                    <div className="space-y-2">
                        <p className="text-xs text-gray-500 mb-3">Game is in progress</p>
                        {user ? (
                            <button
                                onClick={handleSpectate}
                                disabled={joining}
                                className="w-full px-4 py-2.5 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-xl transition-colors shadow-md text-sm disabled:opacity-50"
                            >
                                {joining ? "Joining..." : "Watch Game"}
                            </button>
                        ) : (
                            <Link href="/" className="block w-full px-4 py-2 text-sm font-medium text-blue-500 hover:underline">
                                Log in to watch
                            </Link>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
