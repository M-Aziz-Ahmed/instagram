const express = require("express");
const router = express.Router();

async function translateSingle(text, target) {
    const lang = target || "en";
    const encoded = encodeURIComponent(text.trim());
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${lang}&dt=t&q=${encoded}`;

    const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0", "X-Forwarded-For": "1.1.1.1" },
    });

    if (!res.ok) return text;
    const data = await res.json();
    return data?.[0]?.map((seg) => seg[0]).join("") || text;
}

// POST /
router.post("/", async (req, res) => {
    try {
        const { text, target, batch } = req.body;
        const lang = target || "en";

        if (batch && Array.isArray(batch)) {
            const allText = batch.map((b) => b.text.trim()).join("\n===SPLIT===\n");
            const translated = await translateSingle(allText, lang);
            const parts = translated.split("===SPLIT===");
            const results = {};
            batch.forEach(({ id, text: t }, i) => {
                const tr = parts[i]?.trim();
                if (tr && tr !== t) results[id] = tr;
            });
            return res.json({ results });
        }

        if (!text?.trim()) return res.status(400).json({ error: "Text required" });
        const translated = await translateSingle(text, lang);
        return res.json({ translatedText: translated, sourceLang: "auto" });
    } catch (error) {
        console.error("Translation error:", error);
        return res.status(500).json({ error: "Translation failed" });
    }
});

module.exports = router;
