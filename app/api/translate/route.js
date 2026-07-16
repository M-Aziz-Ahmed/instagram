const CLIENT_IP = "1.1.1.1";

export async function POST(request) {
    try {
        const { text, target } = await request.json();
        if (!text?.trim()) {
            return Response.json({ error: "Text required" }, { status: 400 });
        }

        const lang = target || "en";
        const encoded = encodeURIComponent(text.trim());
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${lang}&dt=t&q=${encoded}`;

        const res = await fetch(url, {
            headers: {
                "User-Agent": "Mozilla/5.0",
                "X-Forwarded-For": CLIENT_IP,
            },
        });

        if (!res.ok) {
            return Response.json({ error: "Translation failed" }, { status: 502 });
        }

        const data = await res.json();
        const translated = data?.[0]?.map((seg) => seg[0]).join("") || text;
        const detectedLang = data?.[2] || "auto";

        return Response.json({ translatedText: translated, sourceLang: detectedLang });
    } catch (error) {
        console.error("Translation error:", error);
        return Response.json({ error: "Translation failed" }, { status: 500 });
    }
}
