let engine = null;
let ready = false;
let bestMoveCallback = null;
let positionCallback = null;

self.onmessage = function(e) {
    const { type, fen, depth, id } = e.data;

    if (type === "init") {
        initEngine();
    } else if (type === "evaluate") {
        evaluatePosition(fen, depth || 15, id);
    } else if (type === "stop") {
        if (engine) {
            engine.postMessage("stop");
        }
    }
};

function initEngine() {
    if (engine) return;

    try {
        importScripts("https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.js");
        engine = self STOCKFISH || self STOCKFISH;
        if (!engine) {
            self.postMessage({ type: "error", message: "Failed to load Stockfish" });
            return;
        }

        engine.onmessage = function(line) {
            if (typeof line !== "string") return;

            if (line === "uciok") {
                ready = true;
                self.postMessage({ type: "ready" });
            } else if (line === "readyok") {
                self.postMessage({ type: "ready" });
            } else if (line.startsWith("bestmove")) {
                const move = line.split(" ")[1];
                if (bestMoveCallback) {
                    bestMoveCallback(move);
                    bestMoveCallback = null;
                }
                self.postMessage({ type: "bestmove", move });
            } else if (line.startsWith("info") && line.includes("score")) {
                const scoreMatch = line.match(/score cp (-?\d+)/);
                const depthMatch = line.match(/depth (\d+)/);
                if (scoreMatch) {
                    self.postMessage({
                        type: "info",
                        score: parseInt(scoreMatch[1]),
                        depth: depthMatch ? parseInt(depthMatch[1]) : 0,
                    });
                }
            }
        };

        engine.postMessage("uci");
    } catch (err) {
        self.postMessage({ type: "error", message: err.message });
    }
}

function evaluatePosition(fen, depth, id) {
    if (!engine || !ready) {
        self.postMessage({ type: "error", message: "Engine not ready" });
        return;
    }

    bestMoveCallback = null;
    engine.postMessage("stop");

    engine.postMessage("position fen " + fen);
    engine.postMessage("go depth " + depth);

    bestMoveCallback = (move) => {
        self.postMessage({ type: "bestmove", move, id });
    };
}
