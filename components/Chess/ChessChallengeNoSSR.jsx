"use client";

import dynamic from "next/dynamic";

const ChessChallengeClient = dynamic(() => import("./ChessChallengeClient"), {
    ssr: false,
    loading: () => (
        <div className="flex items-center justify-center h-96">
            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
    ),
});

export default function ChessChallengeNoSSR({ gameId }) {
    return <ChessChallengeClient gameId={gameId} />;
}
