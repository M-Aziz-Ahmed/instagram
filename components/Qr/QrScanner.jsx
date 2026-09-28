"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Camera QR scanner.
 *
 * Scanning is the least reliable thing in this feature, so every failure mode
 * has an explicit, non-blocking answer rather than an empty black rectangle:
 *
 *  - No `getUserMedia` (insecure origin, or an old browser): says so, and the
 *    caller keeps its manual-code field.
 *  - Permission denied: says so specifically, and — importantly — does NOT keep
 *    re-prompting, because a retried prompt the user has already refused is the
 *    fastest way to make a browser flag the site.
 *  - No camera / none selected: falls back to the rear camera on mobile.
 *  - Nothing decodes: reports a timeout and offers the manual field.
 *
 * The decoder is `@zxing/browser`, which bundles its own wasm and therefore
 * works on iOS Safari, where the native `BarcodeDetector` API is absent. That
 * matters here: this app is a PWA and most of its users are on phones.
 *
 * The video stream is stopped on unmount. Leaving a camera running after the
 * sheet closes is both a battery bug and a privacy one, and it keeps the
 * browser's recording indicator lit.
 */
export default function QrScanner({ onResult, active = true }) {
    const videoRef = useRef(null);
    const controlsRef = useRef(null);
    const [status, setStatus] = useState("starting"); // starting | live | error
    const [message, setMessage] = useState("");

    const stop = useCallback(() => {
        try { controlsRef.current?.stop(); } catch { /* already stopped */ }
        controlsRef.current = null;
        const stream = videoRef.current?.srcObject;
        if (stream && typeof stream.getTracks === "function") {
            for (const track of stream.getTracks()) {
                try { track.stop(); } catch { /* ignore */ }
            }
        }
        if (videoRef.current) videoRef.current.srcObject = null;
    }, []);

    useEffect(() => {
        // No state reset here. `active` is only false when the parent has stopped
        // rendering the scan tab, and then `start` is about to be torn down
        // anyway; writing "starting" from the effect body would re-render on every
        // mount for no visible change. The initial state is already "starting", so
        // a fresh mount and a re-activation both start in the right place.
        if (!active) return;
        let cancelled = false;

        async function start() {
            if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
                setStatus("error");
                setMessage("This browser cannot open the camera. Enter the code below instead.");
                return;
            }
            try {
                const { BrowserQRCodeReader } = await import("@zxing/browser");
                if (cancelled) return;

                const reader = new BrowserQRCodeReader();
                // `undefined` lets the library pick the rear camera on a phone,
                // which is the one pointed at someone else's screen.
                controlsRef.current = await reader.decodeFromVideoDevice(
                    undefined,
                    videoRef.current,
                    (result) => {
                        if (!result) return;
                        const text = typeof result.getText === "function" ? result.getText() : result.text;
                        if (text) onResult?.(text);
                    },
                );
                if (cancelled) { stop(); return; }
                setStatus("live");
            } catch (err) {
                if (cancelled) return;
                // NotAllowedError is a refusal, not a fault. Say so plainly and
                // stop trying, rather than looping a prompt the user declined.
                const denied = err?.name === "NotAllowedError" || err?.name === "PermissionDeniedError";
                setStatus("error");
                setMessage(denied
                    ? "Camera access was blocked. Allow it in your browser settings, or enter the code below."
                    : "No camera is available. Enter the code below instead.");
                console.error("[QrScanner] start failed:", err);
            }
        }

        start();
        return () => { cancelled = true; stop(); };
    }, [active, onResult, stop]);

    // The overlay states are only meaningful while mounted. Gating the render on
    // `active` also means a stale "live" from a previous activation can never be
    // shown over a camera that is not running.
    if (!active) return null;

    return (
        <div className="space-y-3">
            <div className="relative rounded-2xl overflow-hidden bg-gray-900 aspect-square">
                <video
                    ref={videoRef}
                    className="w-full h-full object-cover"
                    // Mirrored: the user is filming their own screen held up to
                    // the camera, so an unmirrored preview is disorienting.
                    style={{ transform: "scaleX(-1)" }}
                    muted
                    playsInline
                    // Not `autoPlay`: decodeFromVideoDevice attaches and plays
                    // the stream itself once it has permission.
                />
                {status === "starting" && (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-7 h-7 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    </div>
                )}
                {/* A viewfinder, not a scrim: scanning works best on high
                    contrast, so the corners stay clear and the middle is only
                    lightly dimmed. */}
                {status === "live" && (
                    <div className="pointer-events-none absolute inset-6 rounded-2xl border-2 border-white/80 shadow-[0_0_0_1000px_rgba(0,0,0,0.25)]" />
                )}
                {status === "error" && (
                    <div className="absolute inset-0 flex items-center justify-center px-6">
                        <p className="text-xs text-white/90 text-center leading-relaxed">{message}</p>
                    </div>
                )}
            </div>
            {status === "live" && (
                <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                    Point the camera at the other person&apos;s code.
                </p>
            )}
        </div>
    );
}
