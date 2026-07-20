"use client";

import dynamic from "next/dynamic";

const BattleshipLobbyClient = dynamic(() => import("./BattleshipLobbyClient"), {
    ssr: false,
    loading: () => (
        <div className="flex items-center justify-center h-96">
            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
    ),
});

export default function BattleshipNoSSR() {
    return <BattleshipLobbyClient />;
}
