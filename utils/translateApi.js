// Client side of the translation feature.
//
// Everything here goes through our own `/api/translate`, which the live server
// proxies to the upstream translator.
//
// That indirection is not incidental. There was a second implementation,
// `utils/translate.js`, that called translate.googleapis.com straight from the
// browser — which means it only worked from networks that can reach Google, so
// it failed for every user in China while appearing to work everywhere else.
// The server-side hop works regardless of where the reader is, so nothing in the
// UI should call the upstream directly. (That file is now unused; it is left in
// place only so nothing that still imports it breaks.)
//
// `utils/translate.js` is therefore dead code. This module is the only supported
// entry point.
//
// Every translate affordance in the app goes through here — PostCard, Chat,
// GroupChatBox and LiveStreamModal. Hand-rolled `fetch("/api/translate")` calls
// bypassed `translateItem`'s guard that drops a translation identical to the
// source, which rendered a duplicate line under text already in the reader's
// language, and bypassed `translateItems`' chunking, which made the server 413
// on a long conversation.

// Batch limits, mirrored from live-server/routes/translate.js. The server is the
// authority and will 413 past these, but chunking here keeps a 200-comment post
// to a handful of requests instead of one that gets rejected.
//
// Exported so utils/translateApi.test.mjs can assert the client and the server
// agree. They are two implementations of one contract in two languages; nothing
// else would notice them drifting apart.
export const MAX_BATCH_ITEMS = 40;
export const MAX_BATCH_CHARS = 8000;

// Separator used to stitch a batch into a single upstream request.
//
// The server requires 12-64 characters and no whitespace, because the upstream
// translator is free to collapse or reflow whitespace and a whitespace-dependent
// delimiter would not survive the round trip. U+241F (SYMBOL FOR UNIT SEPARATOR)
// is a C0-adjacent control character: it will not appear in anything a person
// typed, or in prose from any language we translate.
//
// Length matters and is easy to get wrong: an earlier value of four separators
// + "TR" + five separators is 11 characters, one short of the minimum, so the
// server silently discarded it and fell back to the shared default — which is
// exactly the collision this exists to prevent. Keep it comfortably over 12.
export const BATCH_SEP = "␟␟␟␟␟␟TRSEP␟␟␟␟␟␟";

async function postJSON(body) {
    const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`translate failed: ${res.status}`);
    return res.json();
}

/**
 * Translate one string. Returns null when there is nothing to show — an empty
 * input, or a translation identical to the source (already in the target
 * language), so callers never render a duplicate line under the original.
 */
export async function translateItem(text, target) {
    const trimmed = (text || "").trim();
    if (!trimmed) return null;
    try {
        const data = await postJSON({ text: trimmed, target });
        const out = data?.translatedText;
        if (!out || !out.trim() || out.trim() === trimmed) return null;
        return out.trim();
    } catch {
        return null;
    }
}

/**
 * Translate many strings at once, keyed by the caller's own id.
 *
 * Returns a plain `{ [id]: translation }` map containing only the ids that
 * actually produced a different translation. Items over the per-request limits
 * are split across requests, so callers can hand it a whole comment thread.
 */
export async function translateItems(items, target) {
    const usable = (items || []).filter(
        (i) => i && typeof i.text === "string" && i.text.trim()
    );
    if (usable.length === 0) return {};

    // Chunk on both limits at once: a batch of forty 300-character comments is
    // 12k characters and would be rejected whole, so a count-only chunking would
    // trade one failure for a different one.
    const chunks = [];
    let current = [];
    let chars = 0;
    for (const item of usable) {
        const len = item.text.trim().length;
        if (
            current.length > 0 &&
            (current.length >= MAX_BATCH_ITEMS || chars + len > MAX_BATCH_CHARS)
        ) {
            chunks.push(current);
            current = [];
            chars = 0;
        }
        current.push(item);
        chars += len;
    }
    if (current.length) chunks.push(current);

    const merged = {};
    // Sequential rather than parallel: these all hit one upstream translator,
    // and firing eight at once is how you get throttled.
    for (const chunk of chunks) {
        try {
            const data = await postJSON({ batch: chunk, target, sep: BATCH_SEP });
            if (data?.results) Object.assign(merged, data.results);
        } catch {
            // A failed chunk loses only its own translations; the rest of the
            // thread still gets translated.
        }
    }
    return merged;
}
