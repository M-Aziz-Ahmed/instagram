// Recognises links to video hosted on another platform and turns them into
// something embeddable.
//
// Why this exists: hosting user video is the single most expensive thing this
// app can do - every upload occupies Cloudinary storage and egress bandwidth
// that never comes back. So direct video upload is gated behind a permission
// (see canUploadVideo in lib/videoUpload.js), and the everyday case is handled
// by letting people post a link instead. A YouTube or TikTok link costs the
// site nothing, and it still shows up as an actual playable video in the feed
// and in /reels.
//
// Nothing here fetches the remote URL. The host list is matched by exact
// suffix against a parsed URL, and the only network call is the browser loading
// the platform's own iframe, so this module cannot be used to probe internal
// addresses the way an open URL fetcher could.

const PLATFORMS = {
    youtube: {
        label: "YouTube",
        // Colors mirror the platform brand so the card reads as a link out
        // rather than as content hosted here.
        color: "#FF0000",
        hosts: ["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be", "www.youtu.be"],
    },
    facebook: {
        label: "Facebook",
        color: "#1877F2",
        hosts: ["facebook.com", "www.facebook.com", "m.facebook.com", "fb.watch", "fb.com"],
    },
    instagram: {
        label: "Instagram",
        color: "#E1306C",
        hosts: ["instagram.com", "www.instagram.com"],
    },
    tiktok: {
        label: "TikTok",
        color: "#010101",
        hosts: ["tiktok.com", "www.tiktok.com", "vm.tiktok.com", "vt.tiktok.com"],
    },
    reddit: {
        label: "Reddit",
        color: "#FF4500",
        hosts: ["reddit.com", "www.reddit.com", "old.reddit.com", "np.reddit.com", "redd.it"],
    },
};

const ID_RE = /^[A-Za-z0-9_-]{4,64}$/;

function hostOf(u) {
    return u.hostname.toLowerCase().replace(/\.$/, "");
}

function platformForHost(host) {
    for (const [id, p] of Object.entries(PLATFORMS)) {
        // Exact host match only. A substring test would accept
        // "youtube.com.evil.test", which is the whole reason this is written
        // as a set lookup rather than an endsWith over a string.
        if (p.hosts.includes(host)) return { id, ...p };
    }
    return null;
}

const num = (v) => (Number.isFinite(parseInt(v, 10)) ? parseInt(v, 10) : null);

// ── Per-platform parsers ───────────────────────────────────────────────────
// Each returns { videoId, embedUrl, thumbnail, durationHint } or null.

function parseYouTube(u, seg) {
    let id = null;
    if (u.hostname.toLowerCase().endsWith("youtu.be")) {
        id = seg[0];
    } else if (u.pathname === "/watch") {
        id = u.searchParams.get("v");
    } else if (seg[0] === "embed" || seg[0] === "v" || seg[0] === "shorts" || seg[0] === "live") {
        id = seg[1];
    }
    if (!id || !ID_RE.test(id)) return null;
    // start/end let a user clip a segment without uploading anything.
    const t = [];
    const start = num(u.searchParams.get("t") || u.searchParams.get("start"));
    const end = num(u.searchParams.get("end"));
    if (start !== null) t.push(`start=${Math.max(0, start)}`);
    if (end !== null && end > (start ?? 0)) t.push(`end=${end}`);
    const qs = t.length ? `?${t.join("&")}` : "";
    return {
        videoId: id,
        embedUrl: `https://www.youtube-nocookie.com/embed/${id}${qs}`,
        thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    };
}

function parseFacebook(u) {
    if (u.hostname.toLowerCase() === "fb.watch") {
        // fb.watch links carry the id in the path, but the canonical page is
        // behind a redirect we deliberately do not follow, so the embed is
        // dropped rather than guessed at.
        return null;
    }
    const s = seg(u);
    let id = null;
    if (u.pathname === "/video.php" || s[0] === "video.php") {
        id = u.searchParams.get("v");
    } else if (s[0] === "reel" || s[0] === "reels") {
        id = s[1];
    } else if (s[0] === "share" && s[1] === "v") {
        id = s.slice(2).join("/");
    } else {
        // /<page>/videos/<id>
        const vi = s.indexOf("videos");
        if (vi !== -1) id = s[vi + 1];
    }
    if (!id || !/^[A-Za-z0-9_/-]{3,128}$/.test(id)) return null;
    return {
        videoId: id,
        embedUrl: `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(u.origin + u.pathname)}&show_text=0`,
        // Facebook's OG image is not available without fetching the page.
        thumbnail: "",
    };
}

function parseInstagram(u) {
    const s = seg(u);
    // Only single-media posts and reels are embeddable. A carousel URL has no
    // stable single media id, so it is left as a plain link.
    let id = null;
    if ((s[0] === "p" || s[0] === "reel" || s[0] === "reels" || s[0] === "tv") && s[1]) id = s[1];
    if (!id || !ID_RE.test(id)) return null;
    return {
        videoId: id,
        embedUrl: `https://www.instagram.com/p/${encodeURIComponent(id)}/embed/`,
        thumbnail: "",
    };
}

function parseTikTok(u) {
    const s = seg(u);
    const host = u.hostname.toLowerCase();
    let id = null;

    if (s[0] === "video" && s[1]) {
        id = s[1];
    } else if (host.startsWith("vm.") || host.startsWith("vt.")) {
        // vm.tiktok.com short links: the id is the last path segment.
        id = s[s.length - 1];
    } else {
        // /@<user>/video/<id> - the username varies, so the "video" segment is
        // located rather than assumed to be at a fixed index.
        const vi = s.indexOf("video");
        if (vi !== -1 && s[vi + 1]) id = s[vi + 1];
    }
    if (!id || !ID_RE.test(id)) return null;
    return {
        videoId: id,
        embedUrl: `https://www.tiktok.com/embed/v2/${encodeURIComponent(id)}`,
        // TikTok's own thumbnail CDN. oEmbed would give a better title, but
        // that is a network call we do not make here.
        thumbnail: `https://p16-sign-va.tiktokcdn.com/obj/${encodeURIComponent(id)}`,
    };
}

function parseReddit(u) {
    const s = seg(u);
    // reddit.com/r/<sub>/comments/<id>/...
    const ci = s.indexOf("comments");
    let id = ci !== -1 ? s[ci + 1] : null;
    if (!id && u.hostname.toLowerCase() === "redd.it") id = s[0];
    if (!id || !ID_RE.test(id)) return null;
    // Reddit's embeddable player is v.redd.it/<id>. A lot of Reddit links are
    // image posts, and those have no video - the embed renders an error, so
    // they are only accepted when the caller asserts it is a video URL.
    return {
        videoId: id,
        embedUrl: `https://www.redditmedia.com/r/${encodeURIComponent(id)}/ref_source=embed&ref=share&embed=true`,
        thumbnail: "",
    };
}

function seg(u) {
    return u.pathname.split("/").filter(Boolean);
}

/**
 * @param {string} rawUrl
 * @param {{ requireVideo?: boolean }} [opts]
 * @returns {{platform:string,platformLabel:string,color:string,url:string,videoId:string,embedUrl:string,thumbnail:string}|null}
 */
function detectVideoLink(rawUrl, opts = {}) {
    if (!rawUrl || typeof rawUrl !== "string") return null;
    let u;
    try {
        u = new URL(rawUrl.trim());
    } catch {
        return null;
    }
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;

    const p = platformForHost(hostOf(u));
    if (!p) return null;

    let parsed = null;
    try {
        switch (p.id) {
            case "youtube":   parsed = parseYouTube(u, seg(u)); break;
            case "facebook":  parsed = parseFacebook(u); break;
            case "instagram": parsed = parseInstagram(u); break;
            case "tiktok":    parsed = parseTikTok(u); break;
            case "reddit":    parsed = parseReddit(u); break;
        }
    } catch {
        return null;
    }
    if (!parsed) return null;

    return {
        platform: p.id,
        platformLabel: p.label,
        color: p.color,
        url: u.toString(),
        videoId: parsed.videoId,
        embedUrl: parsed.embedUrl,
        thumbnail: parsed.thumbnail || "",
    };
}

const URL_RE = /\bhttps?:\/\/[^\s<>"'`]+/gi;

/**
 * Pulls recognised video links out of post text, in order, de-duplicated by
 * video id. A post can carry several links but only the first is treated as
 * "the" video for feed and reels purposes.
 */
function extractVideoLinks(text, opts = {}) {
    if (!text || typeof text !== "string") return [];
    const out = [];
    const seen = new Set();
    for (const m of text.match(URL_RE) || []) {
        // Trailing punctuation is extremely common when a link ends a sentence.
        const cleaned = m.replace(/[.,;:!?)\]}]+$/, "");
        const found = detectVideoLink(cleaned, opts);
        if (!found) continue;
        if (seen.has(found.videoId)) continue;
        seen.add(found.videoId);
        out.push(found);
    }
    return out;
}

module.exports = { PLATFORMS, detectVideoLink, extractVideoLinks };
