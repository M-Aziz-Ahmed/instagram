const express = require("express");
const router = express.Router();

// Use global fetch (Node 18+). Fall back gracefully if unavailable.
const fetchImpl = (typeof fetch !== "undefined") ? fetch : null;

// Batch limits.
//
// The route is unauthenticated (only apiLimiter sits in front of it), and it is
// about to start translating every comment on a post — a post carries up to
// MAX_EMBEDDED_COMMENTS (200) of them. Without a cap, one request could ask for
// an unbounded amount of upstream Google Translate work, so both the item count
// and the total character count are bounded here rather than trusted from the
// caller.
const MAX_BATCH_ITEMS = 40;
const MAX_BATCH_CHARS = 8000;

// Items are stitched into one upstream request and split back apart, so the
// batch needs a delimiter. The default is kept for existing callers (Inbox/Chat
// does not send one), but a client that translates arbitrary user text — post
// comments — can contain any character sequence, including the delimiter itself,
// which would shift every subsequent result onto the wrong comment. So the
// client supplies a separator it generated and knows cannot occur.
const DEFAULT_SEP = "\n===SPLIT===\n";

function normalizeSep(sep) {
    if (typeof sep !== "string") return DEFAULT_SEP;
    const trimmed = sep.trim();
    // Must be long enough to be unlikely in prose and must not be whitespace,
    // which the upstream translator is free to collapse or reflow.
    if (trimmed.length < 12 || trimmed.length > 64) return DEFAULT_SEP;
    if (/\s/.test(trimmed)) return DEFAULT_SEP;
    return trimmed;
}

async function translateSingle(text, target) {
    const lang = target || "en";
    const encoded = encodeURIComponent(text.trim());
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${lang}&dt=t&q=${encoded}`;

    if (!fetchImpl) return text;

    const res = await fetchImpl(url, {
        headers: { "User-Agent": "Mozilla/5.0", "X-Forwarded-For": "1.1.1.1" },
    });

    if (!res.ok) return text;
    const data = await res.json();
    return data?.[0]?.map((seg) => seg[0]).join("") || text;
}

function targetLang(target) {
    const lang = typeof target === "string" ? target.trim() : "";
    // BCP-47-ish shape only. This value is interpolated into an upstream URL, so
    // it is validated rather than escaped-and-hoped.
    return /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(lang) ? lang : "en";
}

// POST /
router.post("/", async (req, res) => {
    try {
        const { text, target, batch, sep } = req.body;
        const lang = targetLang(target);

        if (batch && Array.isArray(batch)) {
            if (batch.length === 0) return res.json({ results: {} });
            if (batch.length > MAX_BATCH_ITEMS) {
                return res.status(413).json({
                    error: `Batch too large. Send at most ${MAX_BATCH_ITEMS} items per request.`,
                });
            }

            const sepStr = normalizeSep(sep);
            const usable = [];
            for (const item of batch) {
                const t = typeof item?.text === "string" ? item.text.trim() : "";
                if (!t) continue;
                // An item carrying the separator would corrupt the split for
                // every item after it. Dropping it costs one untranslated string;
                // keeping it would mislabel others.
                if (t.includes(sepStr)) continue;
                usable.push({ id: item.id, text: t });
            }
            if (usable.length === 0) return res.json({ results: {} });

            const totalChars = usable.reduce((n, i) => n + i.text.length, 0);
            if (totalChars > MAX_BATCH_CHARS) {
                return res.status(413).json({
                    error: `Batch text too large. ${totalChars} characters exceeds the ${MAX_BATCH_CHARS} limit.`,
                });
            }

            const translated = await translateSingle(usable.map((i) => i.text).join(sepStr), lang);
            const parts = translated.split(sepStr);
            const results = {};
            usable.forEach(({ id, text: original }, i) => {
                const tr = parts[i]?.trim();
                // Only surface a translation that actually differs, so the client
                // does not render a duplicate line under text already in the
                // target language.
                if (tr && tr !== original) results[id] = tr;
            });
            return res.json({ results });
        }

        if (typeof text !== "string" || !text.trim()) {
            return res.status(400).json({ error: "Text required" });
        }
        if (text.length > MAX_BATCH_CHARS) {
            return res.status(413).json({ error: "Text too long" });
        }
        const translated = await translateSingle(text, lang);
        return res.json({ translatedText: translated, sourceLang: "auto" });
    } catch (error) {
        console.error("Translation error:", error);
        return res.status(500).json({ error: "Translation failed" });
    }
});

module.exports = router;
