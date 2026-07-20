"use client";

import dynamic from "next/dynamic";

const Connect4GameClient = dynamic(() => import("./Connect4GameClient"), {
    ssr: false,
    loading: () => (
        <div className="flex items-center justify-center h-96">
            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
    ),
});

export default function Connect4GameNoSSR({ gameId }) {
    return <Connect4GameClient gameId={gameId} />;
}
