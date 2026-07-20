"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/context/UserContext";

export default function InviteLandingClient({ inviteCode }) {
    const { user, ready } = useUser();
    const router = useRouter();
    const [validating, setValidating] = useState(true);
    const [valid, setValid] = useState(false);
    const [inviter, setInviter] = useState("");
    const [error, setError] = useState("");

    useEffect(() => {
        if (!ready) return;
        if (user && !user.needsSetup) router.replace("/");
    }, [user, ready, router]);

    useEffect(() => {
        const validate = async () => {
            try {
                const res = await fetch("/api/invites/validate", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ code: inviteCode }),
                });
                const data = await res.json();
                if (res.ok && data.valid) {
                    setValid(true);
                    setInviter(data.createdBy);
                } else {
                    setError(data.error || "Invalid invite code");
                }
            } catch {
                setError("Failed to validate invite code");
            }
            setValidating(false);
        };
        validate();
    }, [inviteCode]);

    if (!ready) {
        return (
            <div className="flex h-dvh items-center justify-center dark:bg-gray-950">
                <div className="w-6 h-6 border-2 border-gray-300 dark:border-gray-700 border-t-gray-600 dark:border-t-gray-400 rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="min-h-dvh bg-white dark:bg-gray-950 flex flex-col">
            <div className="border-b border-gray-100 dark:border-gray-800 px-6 py-4">
                <span className="font-black text-xl tracking-tight text-gray-900 dark:text-gray-100">AnonTweet</span>
            </div>

            <div className="flex-1 flex items-center justify-center px-6 py-12">
                <div className="w-full max-w-sm text-center">
                    {validating ? (
                        <div className="flex flex-col items-center gap-4">
                            <div className="w-12 h-12 border-2 border-gray-300 dark:border-gray-700 border-t-gray-600 dark:border-t-gray-400 rounded-full animate-spin" />
                            <p className="text-sm text-gray-500 dark:text-gray-400">Validating invite code...</p>
                        </div>
                    ) : error ? (
                        <div className="flex flex-col items-center gap-4">
                            <div className="w-16 h-16 rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 text-red-500">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                                </svg>
                            </div>
                            <div>
                                <h1 className="text-xl font-black text-gray-900 dark:text-gray-100 mb-1">Invalid Invite</h1>
                                <p className="text-sm text-gray-500 dark:text-gray-400">{error}</p>
                            </div>
                            <button
                                onClick={() => router.replace("/login")}
                                className="mt-4 px-6 py-3 bg-black dark:bg-gray-100 text-white dark:text-gray-900 font-bold rounded-xl hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors"
                            >
                                Go to Sign In
                            </button>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center gap-4">
                            <div className="w-16 h-16 rounded-full bg-green-50 dark:bg-green-900/20 flex items-center justify-center">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 text-green-500">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" />
                                </svg>
                            </div>
                            <div>
                                <h1 className="text-xl font-black text-gray-900 dark:text-gray-100 mb-1">You&apos;re Invited!</h1>
                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                    {inviter && (
                                        <>Invited by <span className="font-semibold text-gray-700 dark:text-gray-300">@{inviter}</span></>
                                    )}
                                </p>
                            </div>
                            <p className="text-xs text-gray-400 dark:text-gray-500">
                                Code: <span className="font-mono font-bold">{inviteCode}</span>
                            </p>
                            <button
                                onClick={() => router.replace(`/login?invite=${inviteCode}`)}
                                className="mt-4 px-6 py-3 bg-black dark:bg-gray-100 text-white dark:text-gray-900 font-bold rounded-xl hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors"
                            >
                                {user ? "Continue to App" : "Create Account"}
                            </button>
                            {user && (
                                <button
                                    onClick={() => router.replace("/")}
                                    className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                                >
                                    Skip for now
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
