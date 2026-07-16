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
    const BATCH_DELAY_MS = 50;
    const results = {};

    await Promise.all(
        items.map(async ({ id, text }) => {
            try {
                const translated = await translateText(text, target);
                if (translated !== text) {
                    results[id] = translated;
                }
            } catch {}
            await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
        })
    );

    return results;
}
