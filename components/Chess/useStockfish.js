"use client";

import { useEffect, useRef, useCallback, useState } from "react";

export default function useStockfish(depth = 15) {
    const workerRef = useRef(null);
    const [ready, setReady] = useState(false);
    const [evaluating, setEvaluating] = useState(false);
    const moveCallbackRef = useRef(null);

    useEffect(() => {
        try {
            const worker = new Worker("/stockfish/stockfish-worker.js");
            workerRef.current = worker;

            worker.onmessage = (e) => {
                const data = e.data;
                if (data.type === "ready") {
                    setReady(true);
                } else if (data.type === "bestmove") {
                    setEvaluating(false);
                    if (moveCallbackRef.current) {
                        moveCallbackRef.current(data.move);
                        moveCallbackRef.current = null;
                    }
                } else if (data.type === "error") {
                    console.error("Stockfish error:", data.message);
                }
            };

            worker.postMessage({ type: "init" });

            return () => {
                worker.terminate();
            };
        } catch (err) {
            console.error("Failed to create Stockfish worker:", err);
        }
    }, []);

    const getBestMove = useCallback((fen, callback, customDepth) => {
        if (!workerRef.current || !ready) {
            return false;
        }
        setEvaluating(true);
        moveCallbackRef.current = callback;
        workerRef.current.postMessage({
            type: "evaluate",
            fen,
            depth: customDepth || depth,
        });
        return true;
    }, [ready, depth]);

    return { ready, evaluating, getBestMove };
}
