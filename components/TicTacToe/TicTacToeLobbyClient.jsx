"use client";

import GameLobby from "@/components/Games/GameLobby";

const AI_LEVELS = [
    { label: "Easy", level: 1, desc: "Random" },
    { label: "Medium", level: 2, desc: "Sometimes slips" },
    { label: "Impossible", level: 3, desc: "Never loses" },
];

export default function TicTacToeLobbyClient() {
    return (
        <GameLobby
            apiBase="tictactoe"
            routeBase="/tictactoe"
            historyKey="tictactoe"
            title="Tic-Tac-Toe"
            subtitle="Get three in a row"
            emoji={"\u274C"}
            aiLevels={AI_LEVELS}
            hostSlot="x"
            guestSlot="o"
            hostColor="X"
            guestColor="O"
        />
    );
}
