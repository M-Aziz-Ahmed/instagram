"use client";

import dynamic from "next/dynamic";

const CheckersGameClient = dynamic(() => import("./CheckersGameClient"), {
    ssr: false,
    loading: () => (
        <div className="flex items-center justify-center h-96">
            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
    ),
});

export default function CheckersGameNoSSR({ gameId }) {
    return <CheckersGameClient gameId={gameId} />;
}
