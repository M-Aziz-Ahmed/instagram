/**
 * Admin API: Games Operations & Analytics.
 *
 * Mounted at /api/admin/games.
 *
 * Every query is driven by the per-game field map in `lib/gameSchemas.js`,
 * because the eight game models disagree about almost everything: what a
 * finished game is called, where the players live, whether moves is a number or
 * an array, and whether a creation timestamp exists at all. A hand-written query
 * per game would be four of them wrong; the map makes the disagreement explicit
 * and testable instead.
 *
 * All aggregation is bounded. Game collections have no TTL, so a collection scan
 * is capped and the response says when it truncated.
 */

const express = require("express");
const mongoose = require("mongoose");

const { requireAdmin, requirePermission } = require("../middleware/auth");
const { GAMES, GAME_KEYS, pick, moveLength, statusIsTerminal } = require("../lib/gameSchemas");
const { logSystem } = require("../logService");

const router = express.Router();

const SCAN_CAP = 20000;
const clamp = (v, min, max, dflt) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return dflt;
    return Math.max(min, Math.min(max, n));
};

const modelCache = new Map();

/** Lazily resolve a game model by name, tolerating a model that is not registered. */
function getModel(name) {
    if (modelCache.has(name)) return modelCache.get(name);
    let resolved = null;
    try {
        resolved = mongoose.models[name] || null;
    } catch {
        resolved = null;
    }
    // Only positive results are cached. Caching a miss would make the "not
    // registered" answer permanent, so a model that finished registering after
    // this router loaded would stay invisible for the life of the process.
    if (resolved) modelCache.set(name, resolved);
    return resolved;
}

function resolveGame(key) {
    const spec = GAMES[key];
    if (!spec) return null;
    const model = getModel(spec.model);
    if (!model) return { ...spec, key, model: null, available: false };
    return { ...spec, key, model, available: true };
}

/** Read a projection that works whether or not the field exists on the schema. */
function projectionFor(spec, extra = {}) {
    const proj = { status: 1, mode: 1, winner: 1, result: 1, resultReason: 1, aiDifficulty: 1, createdAt: 1, _id: 1, ...extra };
    if (spec.moveField === "moveCount") proj.moveCount = 1;
    else proj[spec.moveField] = 1;
    for (const slot of spec.playerSlots) proj[slot] = 1;
    if (spec.hasTimers) { proj["white"] = 1; proj["black"] = 1; }
    return proj;
}

/** GET /overview — the headline numbers for every game at once. */
router.get("/overview", requireAdmin, async (req, res) => {
    try {
        const rows = [];
        for (const key of GAME_KEYS) {
            const g = resolveGame(key);
            if (!g.available) {
                rows.push({ key, label: g.label, available: false, reason: `model ${g.model} not registered` });
                continue;
            }

            const [total, byStatus, aiCount] = await Promise.all([
                g.model.estimatedDocumentCount(),
                g.model.aggregate([
                    { $group: { _id: "$status", count: { $sum: 1 } } },
                    { $sort: { count: -1 } },
                ]).catch(() => []),
                // `$ne: "multiplayer"` alone also matches documents where `mode`
                // is ABSENT, because in Mongo a missing field is not equal to
                // anything. Legacy rows without a mode were therefore all being
                // counted as AI games. Require the field to exist.
                g.model.countDocuments({ mode: { $exists: true, $ne: "multiplayer" } }).catch(() => 0),
            ]);

            const statuses = {};
            for (const s of byStatus) statuses[String(s._id ?? "unset")] = s.count;

            // `abandoned` is in the terminal set for most games, so summing the
            // whole set double-counted it: finished + live + abandoned exceeded
            // total. Abandoned is reported in its own column, so it is carved out
            // here and the three now sum to total.
            const abandoned = statuses.abandoned || 0;
            let finished = 0;
            for (const [status, count] of Object.entries(statuses)) {
                if (status === "abandoned") continue;
                if (statusIsTerminal(status, g.terminal)) finished += count;
            }
            const live = (statuses.active || 0) + (statuses.waiting || 0);

            // Reaction Duel's terminal set is ["finished"] only, so draw +
            // stalemate is structurally always 0. Reporting 0% reads as a
            // measurement, so return null when the game cannot express a draw.
            const canDraw = g.terminal.some((s) => s === "draw" || s === "stalemate");

            rows.push({
                key,
                label: g.label,
                available: true,
                total,
                finished,
                live,
                abandoned,
                waiting: statuses.waiting || 0,
                drawRate: canDraw && finished > 0
                    ? Number(((((statuses.draw || 0) + (statuses.stalemate || 0)) / finished) * 100).toFixed(1))
                    : null,
                drawRatePossible: canDraw,
                aiGames: aiCount,
                aiShare: total > 0 ? Number(((aiCount / total) * 100).toFixed(1)) : null,
                hasCreatedAt: g.hasCreatedAt,
                hasTimers: g.hasTimers,
                statusBreakdown: statuses,
                // Free-string statuses the route does not recognise, so an admin
                // can see when a game finishes under a name not in the map.
                unknownStatuses: Object.keys(statuses).filter((s) => !g.terminal.includes(s) && !["active", "waiting"].includes(s)),
            });
        }

        return res.json({ rows, generatedAt: new Date() });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed", detail: error.message });
    }
});

/** GET /schema-report — the model inconsistencies, as data.
 *  Genuinely useful: it is the list of things that will silently break any
 *  future cross-game query. */
router.get("/schema-report", requireAdmin, async (req, res) => {
    try {
        const NO_ENUM = ["reversi", "battleship", "hangman"];
        const rows = GAME_KEYS.map((key) => {
            const g = GAMES[key];
            return {
                key,
                label: g.label,
                model: g.model,
                registered: !!getModel(g.model),
                hasCreatedAt: g.hasCreatedAt,
                timeSeriesPossible: g.hasCreatedAt,
                moveField: g.moveField,
                moveFieldType: g.moveField === "moves" || g.moveField === "reactions" ? "array" : "number",
                playerSlots: g.playerSlots,
                hasPlayerSlots: g.playerSlots.length > 0,
                terminalStatuses: g.terminal,
                hasTypedStatusEnum: !NO_ENUM.includes(key),
                problems: [
                    ...(g.hasCreatedAt ? [] : ["No createdAt field, so no time series or age-based stuck detection is possible"]),
                    ...(g.playerSlots.length === 0 ? ["No player slots, so per-player statistics cannot be computed"] : []),
                    ...(NO_ENUM.includes(key) ? ["status is a free String with no enum, so terminal states cannot be filtered reliably"] : []),
                ],
            };
        });
        return res.json({
            rows,
            summary: {
                total: rows.length,
                withCreatedAt: rows.filter((r) => r.hasCreatedAt).length,
                withPlayerSlots: rows.filter((r) => r.hasPlayerSlots).length,
                withTypedStatus: rows.filter((r) => r.hasTypedStatusEnum).length,
            },
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed", detail: error.message });
    }
});

/** GET /:key/stats — depth for one game. */
router.get("/:key/stats", requireAdmin, async (req, res) => {
    try {
        const key = req.params.key;
        const g = resolveGame(key);
        if (!g) return res.status(404).json({ error: `Unknown game "${key}"`, validKeys: GAME_KEYS });
        if (!g.available) return res.status(503).json({ error: `Model ${g.model} is not registered` });

        const docs = await g.model.find({}, projectionFor(g)).limit(SCAN_CAP).lean();

        const buckets = { finished: 0, active: 0, waiting: 0, abandoned: 0, other: 0 };
        const moveBuckets = { "0": 0, "1-10": 0, "11-25": 0, "26-50": 0, "51-100": 0, "100+": 0 };
        let totalMoves = 0;
        let movesKnown = 0;
        let aiGames = 0;
        const players = new Map();

        for (const d of docs) {
            const status = String(d.status || "").toLowerCase();
            if (statusIsTerminal(status, g.terminal)) {
                if (status === "abandoned") buckets.abandoned += 1;
                else buckets.finished += 1;
            } else if (status === "active") buckets.active += 1;
            else if (status === "waiting") buckets.waiting += 1;
            else buckets.other += 1;

            if ((d.mode || "") !== "multiplayer") aiGames += 1;

            const len = moveLength(d, g.moveField);
            if (len !== null) {
                movesKnown += 1;
                totalMoves += len;
                const k = len === 0 ? "0" : len <= 10 ? "1-10" : len <= 25 ? "11-25" : len <= 50 ? "26-50" : len <= 100 ? "51-100" : "100+";
                moveBuckets[k] += 1;
            }

            for (const slot of g.playerSlots) {
                const username = pick(d, slot);
                if (!username) continue;
                const entry = players.get(username) || { username, games: 0, wins: 0, losses: 0, draws: 0 };
                entry.games += 1;
                if (d.winner === username) entry.wins += 1;
                else if (d.winner) entry.losses += 1;
                else if (statusIsTerminal(status, g.terminal) && !["abandoned"].includes(status)) entry.draws += 1;
                players.set(username, entry);
            }
        }

        const leaderboard = Array.from(players.values())
            .filter((p) => p.wins > 0)
            .sort((a, b) => b.wins - a.wins || b.games - a.games)
            .slice(0, 25);

        return res.json({
            key,
            label: g.label,
            scanned: docs.length,
            truncated: docs.length > SCAN_CAP,
            scanCap: SCAN_CAP,
            hasCreatedAt: g.hasCreatedAt,
            buckets,
            aiShare: docs.length > 0 ? Number(((aiGames / docs.length) * 100).toFixed(1)) : null,
            gameLength: {
                average: movesKnown > 0 ? Number((totalMoves / movesKnown).toFixed(1)) : null,
                known: movesKnown,
                unknown: docs.length - movesKnown,
                buckets: moveBuckets,
            },
            uniquePlayers: players.size,
            leaderboard,
            note: !g.hasCreatedAt
                ? `${g.label} has no createdAt field, so this is a lifetime snapshot with no time component.`
                : null,
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed", detail: error.message });
    }
});

/** GET /:key/timeline — daily volume. 400 for games with no timestamp. */
router.get("/:key/timeline", requireAdmin, async (req, res) => {
    try {
        const key = req.params.key;
        const g = resolveGame(key);
        if (!g) return res.status(404).json({ error: `Unknown game "${key}"`, validKeys: GAME_KEYS });
        if (!g.available) return res.status(503).json({ error: `Model ${g.model} is not registered` });

        if (!g.hasCreatedAt) {
            // Return 200 with an explicit reason rather than a flat zero series,
            // which is indistinguishable from "nobody played".
            return res.json({
                key,
                label: g.label,
                series: [],
                possible: false,
                reason: `${g.label} has no createdAt field in live-server/models/${g.model.replace("Game", "").toLowerCase()}Game.js, so games cannot be placed on a timeline. Adding the field is a migration, not an admin setting.`,
            });
        }

        const days = clamp(req.query.days, 1, 365, 30);
        const since = new Date(Date.now() - days * 86400000);
        const series = await g.model.aggregate([
            { $match: { createdAt: { $gte: since } } },
            { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, count: { $sum: 1 } } },
            { $sort: { _id: 1 } },
        ]).catch(() => []);

        return res.json({ key, label: g.label, series, days, possible: true });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed", detail: error.message });
    }
});

/** GET /stuck — games that were created but never progressed. */
router.get("/stuck", requireAdmin, async (req, res) => {
    try {
        const hours = clamp(req.query.hours, 1, 24 * 90, 24);
        const PER_GAME_CAP = 500;
        const rows = [];
        let truncated = false;
        const since = new Date(Date.now() - hours * 3600000);

        for (const key of GAME_KEYS) {
            const g = resolveGame(key);
            if (!g.available) continue;
            if (!g.hasCreatedAt) continue; // cannot age a game with no timestamp
            if (!g.waitingIsStuck) continue;

            const stuck = await g.model.find({ status: "waiting", createdAt: { $lte: since } })
                .select("status createdAt mode " + g.playerSlots.join(" "))
                .sort({ createdAt: 1 })
                // One extra row so that hitting the cap is detectable instead of
                // being indistinguishable from "exactly this many are stuck".
                .limit(PER_GAME_CAP + 1)
                .lean();
            if (stuck.length > PER_GAME_CAP) {
                truncated = true;
                stuck.pop();
            }

            for (const d of stuck) {
                rows.push({
                    key,
                    label: g.label,
                    gameId: String(d._id),
                    createdAt: d.createdAt,
                    ageHours: Math.round((Date.now() - new Date(d.createdAt)) / 3600000),
                    mode: d.mode,
                    players: g.playerSlots.map((s) => pick(d, s)).filter(Boolean),
                });
            }
        }

        rows.sort((a, b) => b.ageHours - a.ageHours);
        return res.json({
            rows,
            hours,
            total: rows.length,
            truncated,
            perGameCap: PER_GAME_CAP,
            skipped: GAME_KEYS.filter((k) => !GAMES[k].hasCreatedAt || !GAMES[k].waitingIsStuck),
            note: "Only games with a createdAt field and a 'waiting' start state are checked. Skipped games are listed so a gap is never mistaken for 'nothing stuck'."
                + (truncated ? ` At least one game hit the ${PER_GAME_CAP}-row cap, so this total is a lower bound.` : ""),
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed", detail: error.message });
    }
});

/** POST /resolve-stuck — mark stuck games abandoned. */
router.post("/resolve-stuck", requirePermission("moderate_posts"), async (req, res) => {
    try {
        const { gameIds = [], status = "abandoned" } = req.body || {};
        if (!Array.isArray(gameIds) || gameIds.length === 0) return res.status(400).json({ error: "gameIds required" });
        if (!["abandoned", "active"].includes(status)) return res.status(400).json({ error: "status must be abandoned or active" });

        // Malformed ids used to be silently skipped, so a typo'd or stale id
        // produced `{ ok: true, results: [] }` and read as "nothing to do".
        // They are now collected and reported back.
        const byGame = new Map();
        const rejectedIds = [];
        for (const id of gameIds.slice(0, 500)) {
            if (typeof id !== "string" || !id.includes(":")) { rejectedIds.push({ id, reason: "expected the form gameKey:mongoId" }); continue; }
            const [key, mongoId] = id.split(":");
            if (!GAMES[key]) { rejectedIds.push({ id, reason: `unknown game "${key}"` }); continue; }
            if (!/^[0-9a-fA-F]{24}$/.test(mongoId)) { rejectedIds.push({ id, reason: "not a 24-character ObjectId" }); continue; }
            if (!byGame.has(key)) byGame.set(key, []);
            byGame.get(key).push(mongoId);
        }

        if (byGame.size === 0) {
            return res.status(400).json({
                error: "No valid game ids supplied",
                rejected: rejectedIds,
                expectedFormat: "gameKey:24-hex-character-ObjectId",
            });
        }

        const results = [];
        for (const [key, ids] of byGame) {
            const g = resolveGame(key);
            if (!g.available) { results.push({ key, matched: 0, modified: 0, error: "model not registered" }); continue; }
            // Only annotate the reason when abandoning. Writing
            // "administrative cleanup" onto a game being restored to `active`
            // stamped bookkeeping metadata onto a live game.
            const update = status === "abandoned"
                ? { $set: { status, resultReason: "administrative cleanup" } }
                : { $set: { status } };
            // eslint-disable-next-line no-await-in-loop
            const r = await g.model.updateMany({ _id: { $in: ids }, status: "waiting" }, update);
            results.push({ key, matched: r.matchedCount, modified: r.modifiedCount });
        }

        try {
            logSystem("stuck_games_resolved", { meta: { requested: gameIds.length, results, rejected: rejectedIds.length } });
        } catch { /* ignore */ }

        return res.json({
            ok: true,
            results,
            status,
            rejected: rejectedIds,
            note: "Only games currently in 'waiting' are touched, so `modified` is lower than the number of ids you sent whenever a game was already picked up. Each game's own stuck row shows its key and id.",
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed", detail: error.message });
    }
});

/** GET /suspect — play patterns worth a human look.
 *  Heuristics only, and deliberately conservative: this lists accounts to
 *  REVIEW, never to punish. Perfect win streaks and sub-second move averages
 *  both have innocent explanations (a rematch, a fast-forwarding UI, a strong
 *  player), so the response carries that caveat verbatim. */
router.get("/suspect", requireAdmin, async (req, res) => {
    try {
        const limit = clamp(req.query.limit, 1, 100, 25);
        const rows = [];
        const scannedGames = [];

        for (const key of GAME_KEYS) {
            const g = resolveGame(key);
            if (!g.available || g.playerSlots.length === 0) continue;
            if (!g.hasCreatedAt) continue;
            scannedGames.push(key);

            const since = new Date(Date.now() - 7 * 86400000);
            const docs = await g.model.find({ createdAt: { $gte: since } })
                .select("status mode winner " + g.playerSlots.join(" ") + (g.moveField === "moveCount" ? " moveCount" : " " + g.moveField) + " createdAt")
                .limit(5000)
                .lean();

            const byUser = new Map();
            for (const d of docs) {
                const status = String(d.status || "").toLowerCase();
                // Only FINISHED games count. The previous version incremented
                // `games` for every document the account appeared in, so five
                // wins alongside twenty open boards produced a 100% win rate.
                if (!statusIsTerminal(status, g.terminal) || status === "abandoned") continue;

                for (const slot of g.playerSlots) {
                    const username = pick(d, slot);
                    if (!username) continue;
                    const e = byUser.get(username) || { username, key, label: g.label, games: 0, wins: 0, losses: 0, totalMoves: 0, gamesWithMoves: 0, sawMultiplayer: false };
                    e.games += 1;
                    if (d.winner === username) e.wins += 1;
                    else if (d.winner) e.losses += 1;
                    if ((d.mode || "") === "multiplayer") e.sawMultiplayer = true;
                    const len = moveLength(d, g.moveField);
                    if (len !== null) { e.totalMoves += len; e.gamesWithMoves += 1; }
                    byUser.set(username, e);
                }
            }

            for (const e of byUser.values()) {
                if (e.games < 3) continue;
                const winRate = e.wins / e.games;
                const avgMoves = e.gamesWithMoves > 0 ? e.totalMoves / e.gamesWithMoves : null;
                // A perfect record against the engine is the expected outcome, not
                // a signal. Previously this only checked the FIRST player slot,
                // so an account that was always the second slot in AI games was
                // still flagged.
                if (winRate >= 0.9 && e.games >= 5 && e.sawMultiplayer) {
                    rows.push({
                        username: e.username,
                        key,
                        label: g.label,
                        games: e.games,
                        wins: e.wins,
                        winRate: Number((winRate * 100).toFixed(1)),
                        avgMoves: avgMoves === null ? null : Number(avgMoves.toFixed(1)),
                        reason: "win rate at or above 90% over 5+ finished multiplayer games in one week",
                    });
                }
            }
        }

        rows.sort((a, b) => b.winRate - a.winRate || b.games - a.games);
        return res.json({
            rows: rows.slice(0, limit),
            windowDays: 7,
            scannedGames,
            note: "Heuristic triage only. A high win rate has innocent causes — a rematch, a strong regular, or a fast-forwarding UI. Review before acting; this list is not evidence of cheating."
                + " Only FINISHED, non-abandoned multiplayer games count toward the win rate, so an account with many open boards is not flagged on a small sample of wins.",
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Failed", detail: error.message });
    }
});

module.exports = router;
