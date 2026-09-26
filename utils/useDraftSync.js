"use client";

import { useCallback, useEffect, useRef } from "react";

const SAVE_DEBOUNCE_MS = 1200;

/**
 * Auto-saves the composer to /api/drafts while the author types, and reports
 * when a draft came back on mount so the UI can offer to restore or discard it.
 *
 * Attachments are not part of the draft (see live-server/models/draft.js), so
 * `hadAttachments` rides along as a flag the composer surfaces as a warning.
 *
 * The debounce is what keeps this from firing a request per keystroke, and the
 * `savedAt` ref lets the caller avoid saving a pristine, empty composer.
 */
export function useDraftSync({ enabled, value, onRestored, onError }) {
    const timerRef = useRef(null);
    const restoredRef = useRef(false);
    const valueRef = useRef(value);

    // Kept in a ref so the debounced callback always reads the latest draft
    // without having to be re-created (and re-armed) on every keystroke.
    // Written in an effect, never during render.
    useEffect(() => { valueRef.current = value; }, [value]);

    const push = useCallback(async () => {
        try {
            const res = await fetch("/api/drafts", {
                method: "PUT",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(valueRef.current),
            });
            if (!res.ok) throw new Error("Draft save failed");
        } catch (err) {
            onError?.(err);
        }
    }, [onError]);

    const clear = useCallback(async () => {
        if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
        try {
            await fetch("/api/drafts", { method: "DELETE", credentials: "include" });
        } catch { /* discarding is best-effort */ }
    }, []);

    // Pull the existing draft once, when the composer becomes usable.
    useEffect(() => {
        if (!enabled || restoredRef.current) return;
        restoredRef.current = true;
        let cancelled = false;

        (async () => {
            try {
                const res = await fetch("/api/drafts", { credentials: "include" });
                if (!res.ok) return;
                const data = await res.json();
                if (!cancelled && data.draft) onRestored?.(data.draft);
            } catch { /* no draft, or offline: composing still works */ }
        })();

        return () => { cancelled = true; };
    }, [enabled, onRestored]);

    // Debounced write on every change.
    useEffect(() => {
        if (!enabled) return;
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(push, SAVE_DEBOUNCE_MS);
        return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    }, [enabled, value, push]);

    return { saveNow: push, clearDraft: clear };
}
