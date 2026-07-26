"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useUser } from "@/context/UserContext";
import Link from "next/link";

export default function JoinCommunityPage() {
    const { code } = useParams();
    const router = useRouter();
    const { user } = useUser();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [joined, setJoined] = useState(false);

    useEffect(() => {
        if (!user || !code) return;

        const join = async () => {
            try {
                const res = await fetch(`/api/communities/join/${code}`, { method: "POST", credentials: "include" });
                const data = await res.json();
                if (res.ok) {
                    setJoined(true);
                    setTimeout(() => router.push(`/communities/${data._id}`), 1500);
                } else {
                    setError(data.error || "Invalid invite link");
                }
            } catch (e) {
                setError("Failed to join community");
            } finally {
                setLoading(false);
            }
        };
        join();
    }, [code, user, router]);

    if (!user) {
        return (
            <div className="max-w-sm mx-auto px-4 py-16 text-center">
                <p className="text-gray-500 dark:text-gray-400 text-sm mb-3">Log in to join this community</p>
                <Link href="/login" className="px-6 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-colors inline-block">
                    Log In
                </Link>
            </div>
        );
    }

    return (
        <div className="max-w-sm mx-auto px-4 py-16 text-center">
            {loading ? (
                <div className="space-y-3">
                    <div className="w-12 h-12 bg-gray-100 dark:bg-gray-800 rounded-xl mx-auto animate-pulse" />
                    <p className="text-gray-400 text-sm">Joining community...</p>
                </div>
            ) : error ? (
                <div className="space-y-3">
                    <p className="text-3xl">:(</p>
                    <p className="text-gray-500 dark:text-gray-400 text-sm">{error}</p>
                    <Link href="/communities" className="text-blue-500 text-sm hover:underline inline-block">
                        Browse communities
                    </Link>
                </div>
            ) : (
                <div className="space-y-3">
                    <p className="text-3xl">🎉</p>
                    <p className="text-gray-900 dark:text-gray-100 font-medium">Joined!</p>
                    <p className="text-gray-400 text-sm">Redirecting...</p>
                </div>
            )}
        </div>
    );
}
