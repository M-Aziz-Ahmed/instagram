"use client";

import { useState, useEffect } from "react";
import { useUser } from "@/context/UserContext";
import { useToast } from "@/context/ToastContext";

function Countdown({ expiresAt }) {
    const [remaining, setRemaining] = useState(() => Date.parse(expiresAt) - Date.now());

    // The countdown was frozen: `remaining` was seeded once and nothing ever
    // called `setRemaining` again, so the m:ss never moved and "Ended" was only
    // reachable by remounting the card. Same interval shape as PostCountdown in
    // PostCard.jsx.
    useEffect(() => {
        if (Date.parse(expiresAt) - Date.now() <= 0) return;
        const id = setInterval(() => setRemaining(Date.parse(expiresAt) - Date.now()), 1000);
        return () => clearInterval(id);
    }, [expiresAt]);

    if (remaining <= 0) return <span className="text-red-500 text-[11px] font-medium">Ended</span>;

    const totalSec = Math.floor(remaining / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;

    return (
        <span className="text-gray-400 dark:text-gray-500 text-[11px] tabular-nums">
            {h > 0 ? `${h}h ` : ""}{m}m {String(s).padStart(2, "0")}s
        </span>
    );
}

export default function PollCard({ post, onPollUpdate }) {
    const { user } = useUser();
    const { showToast } = useToast();
    const [voting, setVoting] = useState(false);
    const poll = post.poll;

    if (!poll?.enabled || !poll.options?.length) return null;

    const totalVotes = poll.options.reduce((sum, o) => sum + o.votes.length, 0);
    const myVoteIdx = poll.options.findIndex(o => o.votes.includes(user?.username));
    const hasVoted = myVoteIdx !== -1;
    const isExpired = poll.expiresAt && new Date(poll.expiresAt) < new Date();

    const handleVote = async (idx) => {
        if (!user || voting || isExpired) return;
        setVoting(true);
        try {
            const res = await fetch(`/api/posts/${post._id}/poll/vote`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username: user.username, optionIndex: idx }),
            });
            const data = await res.json();
            if (res.ok && data.poll) {
                onPollUpdate?.(data.poll);
            } else {
                showToast(data.error || "Failed to vote", "error");
            }
        } catch {
            showToast("Network error", "error");
        } finally {
            setVoting(false);
        }
    };

    // Changing a vote is allowed, and the affordance says so. The server has
    // always moved the vote between options (it removes the username from every
    // option before adding it to the new one), but this card used to disable
    // itself after the first vote, so a misclick was permanent and a changed
    // mind had no way out.
    const canChange = hasVoted && !isExpired;

    return (
        <div className="mt-3 rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-3 space-y-2">
            {poll.options.map((opt, idx) => {
                const pct = totalVotes > 0 ? Math.round((opt.votes.length / totalVotes) * 100) : 0;
                const isMyVote = idx === myVoteIdx;
                return (
                    <button
                        // Options are positionally stable within a poll and two of
                        // them can legitimately share the same text, so the index
                        // is the only key that cannot collide.
                        key={idx}
                        onClick={() => handleVote(idx)}
                        disabled={!user || voting || isExpired || isMyVote}
                        aria-busy={voting}
                        title={isMyVote ? "Your vote" : canChange ? "Change your vote" : undefined}
                        className={`relative w-full text-left rounded-xl px-3 py-2.5 text-sm font-medium transition-opacity overflow-hidden min-h-[44px] flex items-center ${voting ? "opacity-60" : "opacity-100"} ${
                            isMyVote ? "cursor-default" : "cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700"
                        } ${isMyVote ? "border border-blue-400 dark:border-blue-500" : ""}`}
                    >
                        {(hasVoted || isExpired) && (
                            // scaleX, not width. Up to five of these are stacked
                            // and absolutely positioned, and animating width
                            // reflows on every frame; a transform is composited.
                            <div
                                className="absolute inset-0 bg-blue-100 dark:bg-blue-900/30 rounded-xl transition-transform duration-300 ease-out origin-left"
                                style={{ transform: `scaleX(${pct / 100})` }}
                            />
                        )}
                        <span className="relative flex items-center justify-between gap-2 w-full min-w-0">
                            {/* min-w-0 + break-words so a long option (a URL) wraps
                                instead of pushing the percentage out of an
                                overflow-hidden button. */}
                            <span className="flex items-center gap-2 min-w-0 break-words text-gray-900 dark:text-gray-100">
                                {isMyVote && (
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24" className="w-4 h-4 text-blue-500 shrink-0">
                                        <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm13.36-1.814a.75.75 0 1 0-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 0 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.14-.094l3.75-5.25Z" clipRule="evenodd" />
                                    </svg>
                                )}
                                {opt.text}
                            </span>
                            {(hasVoted || isExpired) && (
                                <span className="shrink-0 text-xs tabular-nums text-blue-600 dark:text-blue-400 font-bold">{pct}%</span>
                            )}
                        </span>
                    </button>
                );
            })}

            <div className="flex items-center justify-between pt-1">
                {totalVotes > 0 && (
                    <span className="text-[11px] text-gray-400 dark:text-gray-500">
                        {totalVotes} vote{totalVotes !== 1 ? "s" : ""}
                        {canChange && " · tap another option to change your vote"}
                    </span>
                )}
                {/* Voting disables every option, so without this the card just
                    goes dead for a beat with nothing saying why. */}
                {voting && (
                    <span className="text-[11px] text-gray-400 dark:text-gray-500">Voting…</span>
                )}
                {poll.expiresAt && <Countdown expiresAt={poll.expiresAt} />}
            </div>

        </div>
    );
}
