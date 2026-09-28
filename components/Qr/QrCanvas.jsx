"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Renders a QR code to a <canvas>.
 *
 * `qrcode` is loaded with a dynamic import inside the effect rather than a static
 * top-level import. The package ships a Node entry point that reaches for
 * `fs`/`Buffer`, which is fine under Node and breaks in a browser bundle; the
 * dynamic import keeps it out of the server render entirely and gives the code a
 * place to fail loudly (see the `loadError` state) instead of taking the page
 * down with a module-not-found at build time.
 *
 * Error correction is set to "M". The payload here is a short URL, so there is
 * no need to spend the extra 15% module budget on "Q"/"H" that "L" would leave
 * free, and "M" keeps a scuffed sticker or a dim screen readable — which is the
 * realistic failure mode for a code printed on paper.
 */
export default function QrCanvas({ value, size = 224, className = "" }) {
    const canvasRef = useRef(null);
    const [loadError, setLoadError] = useState("");

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !value) return;
        let cancelled = false;

        import("qrcode")
            .then((mod) => {
                if (cancelled) return;
                const toCanvas = mod.default?.toCanvas || mod.toCanvas;
                if (typeof toCanvas !== "function") {
                    throw new Error("qrcode.toCanvas is unavailable");
                }
                return toCanvas(canvas, value, {
                    width: size,
                    margin: 1,
                    errorCorrectionLevel: "M",
                    // Near-black on white in both themes. A themed QR is a QR
                    // that some scanners refuse, and the light/dark variants
                    // differ in contrast rather than hue, so one is enough.
                    color: { dark: "#0f172a", light: "#ffffff" },
                });
            })
            .catch((err) => {
                if (cancelled) return;
                console.error("[QrCanvas] render failed:", err);
                setLoadError("Could not draw the code");
            });

        return () => { cancelled = true; };
    }, [value, size]);

    if (loadError) {
        return (
            <div
                className={`flex items-center justify-center rounded-2xl bg-gray-100 dark:bg-gray-800 text-xs text-gray-500 dark:text-gray-400 px-4 text-center ${className}`}
                style={{ width: size, height: size }}
            >
                {loadError}
            </div>
        );
    }

    return (
        <canvas
            ref={canvasRef}
            // Not decorative: this is the content a camera is pointed at, and a
            // screen reader should be told the code is available as text too.
            role="img"
            aria-label="Your invite QR code. The same link is shown as text below."
            className={`rounded-2xl bg-white ${className}`}
            style={{ width: size, height: size }}
        />
    );
}
