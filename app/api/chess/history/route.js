import { NextResponse } from "next/server";
import dbConnect from "@/utils/db";
import User from "@/models/user";

export async function GET(request) {
    try {
        const username = new URL(request.url).searchParams.get("username");
        if (!username) {
            return NextResponse.json({ error: "Username required" }, { status: 400 });
        }

        await dbConnect();
        const user = await User.findOne({ username })
            .select("chessGames")
            .lean();

        if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        const games = (user.chessGames || [])
            .sort((a, b) => new Date(b.playedAt) - new Date(a.playedAt))
            .slice(0, 50);

        const stats = {
            total: games.length,
            wins: games.filter((g) =>
                (g.result === "1-0" && g.playerColor === "w") ||
                (g.result === "0-1" && g.playerColor === "b")
            ).length,
            losses: games.filter((g) =>
                (g.result === "0-1" && g.playerColor === "w") ||
                (g.result === "1-0" && g.playerColor === "b")
            ).length,
            draws: games.filter((g) => g.result === "1/2-1/2").length,
        };

        return NextResponse.json({ games, stats });
    } catch (error) {
        console.error("[CHESS HISTORY] Fetch error:", error.message);
        return NextResponse.json({ error: "Failed to fetch chess history" }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        const body = await request.json();
        const { username, gameId, opponent, playerColor, result, resultReason, mode, moves, timeControl, gameStats } = body;

        if (!username || !gameId) {
            return NextResponse.json({ error: "Username and gameId required" }, { status: 400 });
        }

        await dbConnect();
        const user = await User.findOne({ username });
        if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        const existing = user.chessGames.find((g) => g.gameId === gameId);
        if (existing) {
            return NextResponse.json({ message: "Game already saved" });
        }

        user.chessGames.push({
            gameId,
            opponent: opponent || "",
            playerColor: playerColor || "w",
            result: result || "*",
            resultReason: resultReason || "",
            mode: mode || "multiplayer",
            moves: moves || 0,
            timeControl: timeControl || "",
            playedAt: new Date(),
            gameStats: gameStats || {},
        });

        if (user.chessGames.length > 200) {
            user.chessGames = user.chessGames.slice(-200);
        }

        await user.save();
        return NextResponse.json({ message: "Game saved" });
    } catch (error) {
        console.error("[CHESS HISTORY] Save error:", error.message);
        return NextResponse.json({ error: "Failed to save game" }, { status: 500 });
    }
}
