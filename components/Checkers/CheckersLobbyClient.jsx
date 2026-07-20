"use client";

import GameLobby from "@/components/Games/GameLobby";

const AI_LEVELS = [
    { label: "Easy", level: 1, desc: "Random play" },
    { label: "Medium", level: 2, desc: "Smart-ish" },
    { label: "Hard", level: 3, desc: "Near perfect" },
];

export default function CheckersLobbyClient() {
    return (
        <GameLobby
            apiBase="checkers"
            routeBase="/checkers"
            historyKey="checkers"
            title="Checkers"
            subtitle="Capture all your opponent's pieces"
            emoji={"\u269B"}
            aiLevels={AI_LEVELS}
            hostSlot="red"
            guestSlot="black"
            hostColor="Red"
            guestColor="Black"
        />
    );
}
