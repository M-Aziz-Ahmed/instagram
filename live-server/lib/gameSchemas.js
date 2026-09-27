/**
 * Per-game schema map.
 *
 * The eight game models are NOT consistent, and assuming they are produces
 * plausible-looking analytics that are quietly wrong. Verified field-by-field
 * against `live-server/models/*.js`:
 *
 *   | model            | status enum                                   | moves      | createdAt |
 *   |------------------|-----------------------------------------------|------------|-----------|
 *   | chessGame        | waiting active checkmate stalemate draw ...    | moves[]    | YES       |
 *   | connect4Game     | waiting active win draw resigned abandoned     | moves[]    | YES       |
 *   | checkersGame     | waiting active win draw resigned abandoned     | moveCount  | YES       |
 *   | tictactoeGame    | waiting active win draw resigned abandoned     | moveCount  | YES       |
 *   | reversiGame      | NO ENUM (free string, default "waiting")       | moveCount  | NO        |
 *   | battleshipGame   | NO ENUM                                       | moveCount  | NO        |
 *   | hangmanGame      | NO ENUM (default "active")                    | moveCount  | NO        |
 *   | reactionduelGame | waiting active finished                        | reactions  | NO        |
 *
 * Consequences that this map exists to encode:
 *
 *  1. "Finished" is not one value. Chess finishes with `checkmate`/`stalemate`/
 *     `draw`; checkers/tictactoe/connect4 with `win`/`draw`; reactionduel with
 *     `finished`. A single `status: { $in: ["finished","done","complete"] }`
 *     query returns zero rows for every game.
 *  2. Four of eight models have NO `createdAt`, so no time series is possible
 *     for them at all. The API reports `hasCreatedAt: false` rather than
 *     returning a flat zero series that looks like "no games were played".
 *  3. Player slots are named differently everywhere: `white`/`black`,
 *     `red`/`yellow`, `red`/`black`, `x`/`o`, `black`/`white`, singular
 *     `player` (hangman), and a `players` array (reactionduel). Battleship has
 *     no player slots at all, just a `boards` object.
 *  4. Move length lives in `moves` (an array) for chess/connect4 and
 *     `moveCount` (a number) elsewhere. `null` means "unknown", not "zero".
 */

const GAMES = {
    chess: {
        model: "ChessGame",
        label: "Chess",
        hasCreatedAt: true,
        // Chess is the only game with per-player clocks.
        hasTimers: true,
        playerSlots: ["white.username", "black.username"],
        moveField: "moves",
        terminal: ["checkmate", "stalemate", "draw", "resigned", "timeout", "abandoned"],
        // A game that never started and is far past creation is abandoned-in-place.
        waitingIsStuck: true,
    },
    connect4: {
        model: "Connect4Game",
        label: "Connect 4",
        hasCreatedAt: true,
        hasTimers: false,
        playerSlots: ["red.username", "yellow.username"],
        moveField: "moves",
        terminal: ["win", "draw", "resigned", "abandoned"],
        waitingIsStuck: true,
    },
    checkers: {
        model: "CheckersGame",
        label: "Checkers",
        hasCreatedAt: true,
        hasTimers: false,
        playerSlots: ["red.username", "black.username"],
        moveField: "moveCount",
        terminal: ["win", "draw", "resigned", "abandoned"],
        waitingIsStuck: true,
    },
    tictactoe: {
        model: "TicTacToeGame",
        label: "Tic-tac-toe",
        hasCreatedAt: true,
        hasTimers: false,
        playerSlots: ["x.username", "o.username"],
        moveField: "moveCount",
        terminal: ["win", "draw", "resigned", "abandoned"],
        waitingIsStuck: true,
    },
    reversi: {
        model: "ReversiGame",
        label: "Reversi",
        hasCreatedAt: false,
        hasTimers: false,
        playerSlots: ["black.username", "white.username"],
        moveField: "moveCount",
        // No enum, so these are the values the route actually writes. Unverified
        // free strings cannot be filtered reliably — see `statusIsTerminal`.
        terminal: ["win", "draw", "resigned", "abandoned", "black", "white"],
        waitingIsStuck: true,
    },
    battleship: {
        model: "BattleshipGame",
        label: "Battleship",
        hasCreatedAt: false,
        hasTimers: false,
        // No player slots in the schema; participants are only reachable via the
        // free-form `boards` object, so per-player stats are not computable.
        playerSlots: [],
        moveField: "moveCount",
        terminal: ["win", "draw", "resigned", "abandoned"],
        waitingIsStuck: true,
    },
    hangman: {
        model: "HangmanGame",
        label: "Hangman",
        hasCreatedAt: false,
        hasTimers: false,
        playerSlots: ["player.username"],
        moveField: "moveCount",
        terminal: ["win", "draw", "lost", "abandoned"],
        waitingIsStuck: false, // defaults to "active", not "waiting"
    },
    reactionduel: {
        model: "ReactionduelGame",
        label: "Reaction Duel",
        hasCreatedAt: false,
        hasTimers: false,
        playerSlots: ["players.username"],
        moveField: "reactions",
        // Its status enum is ONLY waiting/active/finished, so mongoose would
        // reject "abandoned" outright. Listing it here would make the stuck-game
        // cleanup report matches that can never exist.
        terminal: ["finished"],
        waitingIsStuck: true,
    },
};

const GAME_KEYS = Object.keys(GAMES);

/**
 * Read a possibly-dotted path off a lean document.
 * @returns {*} the value, or undefined if any hop is missing.
 */
function pick(doc, path) {
    if (!doc) return undefined;
    let node = doc;
    for (const part of path.split(".")) {
        if (node === null || node === undefined) return undefined;
        node = node[part];
    }
    return node;
}

/**
 * Length of a game in moves.
 * `moves` is an array, `moveCount` a number, `reactions` an array of rounds.
 * @returns {number|null} null when the field is absent or not numeric-ish,
 *   which is deliberately distinct from 0.
 */
function moveLength(doc, moveField) {
    if (!doc) return null;
    if (moveField === "moves" || moveField === "reactions") {
        const arr = doc[moveField];
        if (Array.isArray(arr)) return arr.length;
        // A route may have written a plain count into a field that is normally
        // an array. That is still a usable length, so fall through rather than
        // reporting "unknown" for a number we can read.
        if (typeof arr === "number" && Number.isFinite(arr)) return arr;
        return null;
    }
    const n = doc[moveField];
    if (typeof n === "number" && Number.isFinite(n)) return n;
    if (Array.isArray(n)) return n.length;
    return null;
}

/**
 * A game is finished if its status is in this game's own terminal set.
 *
 * For the four models with NO enum this is best-effort: the field is a free
 * string, so an unexpected value is reported as "not terminal" rather than
 * guessed at, and `unknownStatuses` is surfaced so an admin can see it.
 */
function statusIsTerminal(status, terminal) {
    if (!status) return false;
    return terminal.includes(String(status).toLowerCase());
}

module.exports = { GAMES, GAME_KEYS, pick, moveLength, statusIsTerminal };
