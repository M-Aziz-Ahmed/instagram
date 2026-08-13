"use client";

import dynamic from "next/dynamic";

const ForgotPinClient = dynamic(() => import("./ForgotPinClient"), {
    ssr: false,
    loading: () => (
        <div className="flex h-dvh items-center justify-center bg-white dark:bg-gray-950">
            <div className="w-6 h-6 border-2 border-gray-300 dark:border-gray-700 border-t-gray-600 dark:border-t-gray-400 rounded-full animate-spin" />
        </div>
    ),
});

export default function ForgotPinNoSSR() {
    return <ForgotPinClient />;
}
