import connectDB from "@/utils/db";

const YT_SEARCH_REGEX = /var ytInitialData = ({.*?});<\/script>/s;
const YT_VIDEO_RENDERER = /"videoRenderer":\s*({[^}]*"videoId":"[^"]*"[^}]*})/g;

function parseDuration(text) {
    if (!text) return 0;
    const parts = text.split(":").map(Number);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return parts[0] || 0;
}

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const q = searchParams.get("q");
        if (!q?.trim()) {
            return Response.json({ error: "Query required" }, { status: 400 });
        }

        const results = [];

        // Method 1: Use YouTube's oembed for basic search
        try {
            const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(q.trim())}&sp=EgIQAQ%3D%3D`;
            const res = await fetch(searchUrl, {
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                    "Accept-Language": "en-US,en;q=0.9",
                },
            });
            const html = await res.text();

            // Extract video data from the initial data JSON
            const dataMatch = html.match(/var ytInitialData = ({.*?});<\/script>/s);
            if (dataMatch) {
                try {
                    const data = JSON.parse(dataMatch[1]);
                    const contents = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents || [];

                    for (const item of contents) {
                        const video = item.videoRenderer;
                        if (!video) continue;

                        const videoId = video.videoId;
                        if (!videoId) continue;

                        const title = video.title?.runs?.[0]?.text || "";
                        const thumbnail = video.thumbnail?.thumbnails?.slice(-1)?.[0]?.url || "";
                        const channelName = video.ownerText?.runs?.[0]?.text || "";
                        const durationText = video.lengthText?.simpleText || video.lengthText?.accessibility?.accessibilityData?.label || "";
                        const duration = parseDuration(durationText);
                        const viewCount = video.viewCountText?.simpleText || "";

                        results.push({
                            videoId,
                            title,
                            thumbnail,
                            channelName,
                            duration,
                            durationText,
                            viewCount,
                        });

                        if (results.length >= 20) break;
                    }
                } catch {}
            }
        } catch {}

        // Method 2: Fallback to oembed if no results
        if (results.length === 0) {
            try {
                const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/results?search_query=${encodeURIComponent(q.trim())}&format=json`;
                const res = await fetch(oembedUrl);
                if (res.ok) {
                    const data = await res.json();
                    if (data.title) {
                        results.push({
                            videoId: "",
                            title: data.title,
                            thumbnail: data.thumbnail_url || "",
                            channelName: data.author_name || "",
                            duration: 0,
                            durationText: "",
                            viewCount: "",
                        });
                    }
                }
            } catch {}
        }

        return Response.json({ results });
    } catch (error) {
        console.error("Music search error:", error);
        return Response.json({ error: "Search failed" }, { status: 500 });
    }
}
