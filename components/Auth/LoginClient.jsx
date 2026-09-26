"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useUser } from "@/context/UserContext";
import { getRedirectTarget } from "@/utils/redirect";
import LoginForm from "./LoginForm";
import SetupForm from "./SetupForm";
import BrandLogo from "@/components/common/BrandLogo";

export default function LoginClient() {
    const { user, ready } = useUser();
    const router          = useRouter();
    const searchParams    = useSearchParams();
    const [screen, setScreen] = useState("login");

    // Intended destination from the query param. Validated because it is
    // attacker-controllable — an unchecked value is an open redirect.
    const redirectTo = getRedirectTarget(searchParams);

    useEffect(() => {
        if (!ready) return;
        if (user && !user.needsSetup) router.replace(redirectTo);
        if (user && user.needsSetup) setScreen("setup");
    }, [user, ready, router, redirectTo]);

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
                <BrandLogo />
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
                                    else router.replace(redirectTo);
                                }}
                            />
                        </>
                    ) : (
                        <SetupForm onDone={() => router.replace(redirectTo)} />
                    )}
                </div>
            </div>
        </div>
    );
}
