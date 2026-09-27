"use client";

import { useEffect, useCallback } from "react";

export default function ImageLightbox({ src, alt, onClose }) {
    const handleKey = useCallback((e) => {
        if (e.key === "Escape") onClose();
    }, [onClose]);

    useEffect(() => {
        document.addEventListener("keydown", handleKey);
        // The page behind must not scroll under the lightbox. Snapshot whatever
        // was set and put that back on close instead of clearing to "": this
        // dialog can open on top of another overlay that is holding the lock
        // itself, and wiping its value on unmount would let the page scroll
        // behind a dialog that is still open.
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.removeEventListener("keydown", handleKey);
            document.body.style.overflow = previousOverflow;
        };
    }, [handleKey]);

    if (!src) return null;

    return (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-toast-in"
            onClick={onClose}
        >
            <button
                onClick={onClose}
                aria-label="Close"
                // safe-top: this is a black-translucent PWA, so on a notched
                // device `top-4` alone lands the X inside the notch.
                className="absolute top-4 right-4 safe-top text-white/80 hover:text-white transition-colors z-10 p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center"
            >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-7 h-7">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
            </button>
            <img
                src={src}
                alt={alt || ""}
                // dvh, not vh: on iOS `vh` is the largest viewport, so browser
                // chrome ate the top and bottom of a portrait photo.
                className="max-w-[90vw] max-h-[85dvh] object-contain rounded-lg select-none"
                onClick={(e) => e.stopPropagation()}
                draggable={false}
            />
        </div>
    );
}
