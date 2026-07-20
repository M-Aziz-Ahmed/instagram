"use client";

import GameLobby from "@/components/Games/GameLobby";

const AI_LEVELS = [
    { label: "Easy", level: 1, desc: "Random" },
    { label: "Medium", level: 3, desc: "Thinks ahead" },
    { label: "Hard", level: 5, desc: "Strong search" },
];

export default function ReversiLobbyClient() {
    return (
        <GameLobby
            apiBase="reversi"
            routeBase="/reversi"
            historyKey="reversi"
            title="Reversi"
            subtitle="Flip discs to dominate the board"
            emoji={"\u26AB"}
            aiLevels={AI_LEVELS}
            hostSlot="black"
            guestSlot="white"
            hostColor="Black"
            guestColor="White"
        />
    );
}
