"use client";

import dynamic from "next/dynamic";

// ssr: false must live in a client component (Next.js App Router restriction).
// Explore is client-driven anyway: it reads the session for visibility filtering
// and paginates on scroll, so there is nothing useful to server-render.
const ExploreClient = dynamic(() => import("./ExploreClient"), {
    ssr: false,
    loading: () => (
        <div className="min-h-dvh app-bg flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-gray-300 dark:border-gray-700 border-t-[var(--brand-500)] rounded-full animate-spin" />
        </div>
    ),
});

export default function ExploreNoSSR() {
    return <ExploreClient />;
}
