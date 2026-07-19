import { NextResponse } from "next/server";
import dbConnect from "@/utils/db";
import User from "@/models/user";

const VALID_GAMES = ["connect4", "tictactoe", "checkers", "reversi", "battleship", "hangman"];

export async function GET(request) {
    try {
        const url = new URL(request.url);
        const username = url.searchParams.get("username");
        const game = url.searchParams.get("game");
        if (!username) {
            return NextResponse.json({ error: "Username required" }, { status: 400 });
        }

        await dbConnect();
        const user = await User.findOne({ username }).select("gameHistory").lean();
        if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        let games = (user.gameHistory || []);
        if (game) games = games.filter((g) => g.game === game);
        games = games
            .sort((a, b) => new Date(b.playedAt) - new Date(a.playedAt))
            .slice(0, 50);

        const stats = {
            total: games.length,
            wins: games.filter((g) => g.outcome === "win").length,
            losses: games.filter((g) => g.outcome === "loss").length,
            draws: games.filter((g) => g.outcome === "draw").length,
        };

        return NextResponse.json({ games, stats });
    } catch (error) {
        console.error("[GAMES HISTORY] Fetch error:", error.message);
        return NextResponse.json({ error: "Failed to fetch game history" }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        const body = await request.json();
        const { username, game, gameId, opponent, outcome, resultReason, mode, moves } = body;

        if (!username || !gameId || !game || !outcome) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }
        if (!VALID_GAMES.includes(game)) {
            return NextResponse.json({ error: "Invalid game" }, { status: 400 });
        }
        if (!["win", "loss", "draw"].includes(outcome)) {
            return NextResponse.json({ error: "Invalid outcome" }, { status: 400 });
        }

        await dbConnect();
        const user = await User.findOne({ username });
        if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        const existing = user.gameHistory.find((g) => g.gameId === gameId && g.game === game);
        if (existing) {
            return NextResponse.json({ message: "Game already saved" });
        }

        user.gameHistory.push({
            game,
            gameId,
            opponent: opponent || "",
            outcome,
            resultReason: resultReason || "",
            mode: mode || "multiplayer",
            moves: moves || 0,
            playedAt: new Date(),
        });

        if (user.gameHistory.length > 300) {
            user.gameHistory = user.gameHistory.slice(-300);
        }

        await user.save();
        return NextResponse.json({ message: "Game saved" });
    } catch (error) {
        console.error("[GAMES HISTORY] Save error:", error.message);
        return NextResponse.json({ error: "Failed to save game" }, { status: 500 });
    }
}
