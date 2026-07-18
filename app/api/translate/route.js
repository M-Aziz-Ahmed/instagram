const CLIENT_IP = "1.1.1.1";

async function translateSingle(text, target) {
    const lang = target || "en";
    const encoded = encodeURIComponent(text.trim());
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${lang}&dt=t&q=${encoded}`;

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

export async function POST(request) {
    try {
        const body = await request.json();
        const target = body.target || "en";

        // Batch mode: { batch: [{ id, text }], target }
        if (body.batch && Array.isArray(body.batch)) {
            const allText = body.batch.map((b) => b.text.trim()).join("\n===SPLIT===\n");
            const translated = await translateSingle(allText, target);
            const parts = translated.split("===SPLIT===");
            const results = {};
            body.batch.forEach(({ id, text }, i) => {
                const t = parts[i]?.trim();
                if (t && t !== text) results[id] = t;
            });
            return Response.json({ results });
        }

        // Single mode: { text, target }
        const { text } = body;
        if (!text?.trim()) {
            return Response.json({ error: "Text required" }, { status: 400 });
        }

        const translated = await translateSingle(text, target);
        return Response.json({ translatedText: translated, sourceLang: "auto" });
    } catch (error) {
        console.error("Translation error:", error);
        return Response.json({ error: "Translation failed" }, { status: 500 });
    }
}
