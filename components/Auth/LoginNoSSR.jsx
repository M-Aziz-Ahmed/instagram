"use client";

import dynamic from "next/dynamic";

const LoginClient = dynamic(() => import("./LoginClient"), {
    ssr: false,
    loading: () => (
        <div className="flex h-dvh items-center justify-center bg-white">
            <div className="w-6 h-6 border-2 border-gray-300 dark:border-gray-700 border-t-gray-600 dark:border-t-gray-400 rounded-full animate-spin" />
        </div>
    ),
});

export default function LoginNoSSR() {
    return <LoginClient />;
}
