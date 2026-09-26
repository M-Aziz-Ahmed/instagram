"use client";

import dynamic from "next/dynamic";

// The feed is entirely client-driven (viewer identity, IntersectionObserver
// playback, infinite scroll), so there is nothing meaningful to render on the
// server and the dynamic boundary keeps it out of the server component graph.
const ReelsClient = dynamic(() => import("./ReelsClient"), {
    ssr: false,
    loading: () => (
        <div className="min-h-dvh flex items-center justify-center bg-black">
            <div className="w-7 h-7 border-2 border-gray-700 border-t-gray-300 rounded-full animate-spin" />
        </div>
    ),
});

export default function ReelsNoSSR() {
    return <ReelsClient />;
}
