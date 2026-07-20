"use client";

import GameLobby from "@/components/Games/GameLobby";

const AI_LEVELS = [
    { label: "Easy", level: 1, desc: "Random shots" },
    { label: "Medium", level: 3, desc: "Hunts hits" },
    { label: "Hard", level: 5, desc: "Smart targeting" },
];

export default function BattleshipLobbyClient() {
    return (
        <GameLobby
            apiBase="battleship"
            routeBase="/battleship"
            historyKey="battleship"
            title="Battleship"
            subtitle="Sink the enemy fleet"
            emoji={"\uD83D\uDEA2"}
            aiLevels={AI_LEVELS}
            hostSlot="p1"
            guestSlot="p2"
            hostColor="Player 1"
            guestColor="Player 2"
        />
    );
}
