const CLIENT_IP = "1.1.1.1";

export async function translateText(text, target = "en") {
    if (!text?.trim()) return text;

    const encoded = encodeURIComponent(text.trim());
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${target}&dt=t&q=${encoded}`;

    const res = await fetch(url, {
        headers: {
            "User-Agent": "Mozilla/5.0",
            "X-Forwarded-For": CLIENT_IP,
        },
    });

    if (!res.ok) return text;

    const data = await res.json();
    return data?.[0]?.map((seg) => seg[0]).join("") || text;
}

export async function translateBatch(items, target = "en") {
    const results = {};
    const toTranslate = items.filter(({ text }) => text?.trim());

    if (toTranslate.length === 0) return results;

    const allText = toTranslate.map(({ text }) => text.trim()).join("\n===SPLIT===\n");
    try {
        const translated = await translateText(allText, target);
        const parts = translated.split("===SPLIT===");
        toTranslate.forEach(({ id }, i) => {
            const t = parts[i]?.trim();
            if (t && t !== toTranslate[i].text) {
                results[id] = t;
            }
        });
    } catch {
        // Fallback: translate individually (no delay)
        await Promise.all(
            toTranslate.map(async ({ id, text }) => {
                try {
                    const t = await translateText(text, target);
                    if (t !== text) results[id] = t;
                } catch {}
            })
        );
    }

    return results;
}
