"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/context/UserContext";
import LoginForm from "./LoginForm";
import SetupForm from "./SetupForm";

export default function LoginClient() {
    const { user, ready } = useUser();
    const router          = useRouter();
    const [screen, setScreen] = useState("login");

    useEffect(() => {
        if (!ready) return;
        if (user && !user.needsSetup) router.replace("/");
        if (user && user.needsSetup) setScreen("setup");
    }, [user, ready, router]);

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
                <span className="font-black text-xl tracking-tight text-gray-900 dark:text-gray-100">AnonFeed</span>
            </div>

            <div className="flex-1 flex items-center justify-center px-6 py-12">
                <div className="w-full max-w-sm">
                    {screen === "login" ? (
                        <>
                            <h1 className="font-black text-3xl text-gray-900 dark:text-gray-100 mb-2">
                                {screen === "login" ? "Sign in" : "Welcome"}
                            </h1>
                            <p className="text-gray-500 dark:text-gray-400 text-sm mb-8">
                                Enter your email — we&apos;ll send you a code. No password needed.
                            </p>
                            <LoginForm
                                onSuccess={(needsSetup) => {
                                    if (needsSetup) setScreen("setup");
                                    else router.replace("/");
                                }}
                            />
                        </>
                    ) : (
                        <SetupForm onDone={() => router.replace("/")} />
                    )}
                </div>
            </div>
        </div>
    );
}
