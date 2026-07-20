"use client";

import dynamic from "next/dynamic";

const Game2048LobbyClient = dynamic(() => import("./Game2048LobbyClient"), {
    ssr: false,
    loading: () => (
        <div className="flex items-center justify-center h-96">
            <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
        </div>
    ),
});

export default function Game2048NoSSR() {
    return <Game2048LobbyClient />;
}
