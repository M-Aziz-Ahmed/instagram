/**
 * Media (image/video) moderation.
 *
 * ── Why this is post-hoc and not at upload time ──────────────────────────────
 * Every uploader in this app posts DIRECTLY to Cloudinary from the browser with
 * an UNSIGNED preset (`NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET`, 10 call sites in
 * components/*). The bytes are therefore already on Cloudinary and publicly
 * reachable before the app is ever consulted. There is no server upload route to
 * hook, and Cloudinary's moderation add-ons are applied through the upload API,
 * which we do not call.
 *
 * What we DO have is the final `secure_url`, delivered to the server on the
 * write request, plus `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` in
 * `live-server/.env`. So the only correct design is: screen the already-uploaded
 * asset, then either accept it or reject the write AND destroy the asset. That
 * destroy step is what makes "block uploads containing nudity" real rather than
 * cosmetic — without it every rejected file is orphaned in the Cloudinary
 * account forever, and the raw asset stays fetchable by anyone with the URL even
 * though no post references it.
 *
 * ── Honest limitation ───────────────────────────────────────────────────────
 * This is a PROVIDER PLUG-IN, not a classifier. Real nudity detection needs a
 * trained model. There is no such model in this repo and none in package.json, so
 * with `provider: "none"` (the default) this module performs only STRUCTURAL
 * checks — host allowlist, Cloudinary URL validity, rollback — and does NOT look
 * at pixels. An admin must configure a provider to get real detection:
 *
 *   cloudinary  Cloudinary moderation add-on, over the Admin API we already hold
 *               credentials for. Requires the add-on to be enabled on the
 *               Cloudinary account. Cheapest option — no new vendor.
 *   google      Google Cloud Vision SafeSearch (LIKELY/VERY_LIKELY), REST + a
 *               service-account key. Needs `GOOGLE_CLOUD_VISION_API_KEY`.
 *   aws         Amazon Rekognition DetectModerationLabels, REST + SigV4. Needs
 *               `AWS_REKOGNITION_*` credentials.
 *
 * Every provider path returns a normalised verdict, and `failureMode` decides
 * what happens when the provider errors or is unconfigured.
 */

const ContentFilter = require("../models/contentFilter");

// ── Cloudinary helpers ───────────────────────────────────────────────────────

let cloudinaryClient = null;
function getCloudinary() {
    if (cloudinaryClient !== null) return cloudinaryClient;
    try {
        // The SDK is a direct dependency; require it lazily so the module still
        // loads (and the text filter still works) if it is ever removed.
        const { v2 } = require("cloudinary");
        const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
        const apiKey = process.env.CLOUDINARY_API_KEY;
        const apiSecret = process.env.CLOUDINARY_API_SECRET;
        if (!cloudName || !apiKey || !apiSecret) {
            cloudinaryClient = false;
            return false;
        }
        v2.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true });
        cloudinaryClient = v2;
    } catch {
        cloudinaryClient = false;
    }
    return cloudinaryClient;
}

const CLOUDINARY_HOSTS = new Set(["res.cloudinary.com", "upload.cloudinary.com"]);

/**
 * Split a Cloudinary delivery URL into its addressable parts.
 * .../image/upload/v1234567890/anon-feed/abc123.jpg
 *              ^type  ^upload          ^folder  ^publicId
 *
 * Folder is not part of the public_id; everything after the version is. Folders
 * containing a slash are preserved.
 */
function parseCloudinaryUrl(url) {
    let parsed;
    try {
        parsed = new URL(String(url));
    } catch {
        return null;
    }
    if (parsed.protocol !== "https:" || !CLOUDINARY_HOSTS.has(parsed.hostname)) return null;

    const parts = parsed.pathname.split("/").filter(Boolean);
    // Expected: [resource_type, "upload", <transformations...>, version?, public_id...]
    const typeIdx = parts.findIndex((p) => p === "image" || p === "video" || p === "raw");
    if (typeIdx === -1 || parts[typeIdx + 1] !== "upload") return null;

    const rest = parts.slice(typeIdx + 2);
    // Transformations are comma/colon separated segments; the version is a
    // leading "v<digits>". Skip both to reach the public id.
    const tail = rest.filter((seg) => !/^v\d+$/.test(seg) && !seg.includes(",") && !seg.includes(":"));
    if (tail.length === 0) return null;

    const publicId = tail.join("/").replace(/\.[a-z0-9]+$/i, "");
    if (!publicId) return null;
    return {
        resourceType: parts[typeIdx] === "raw" ? "image" : parts[typeIdx],
        publicId,
        format: (tail[tail.length - 1].match(/\.([a-z0-9]+)$/i) || [])[1] || null,
    };
}

/** Best-effort removal of an asset we are refusing to publish. */
async function destroyAsset(url) {
    if (process.env.MEDIA_MODERATION_DESTRUCTURE === "1") {
        // Escape hatch for local/dev where destroying a shared asset is unwanted.
        return { destroyed: false, reason: "disabled" };
    }
    const cloudinary = getCloudinary();
    if (!cloudinary) return { destroyed: false, reason: "no-credentials" };
    const parsed = parseCloudinaryUrl(url);
    if (!parsed) return { destroyed: false, reason: "not-cloudinary" };
    try {
        await cloudinary.uploader.destroy(parsed.publicId, {
            resource_type: parsed.resourceType,
            invalidate: true,
        });
        return { destroyed: true };
    } catch (err) {
        return { destroyed: false, reason: err && err.message ? err.message : "error" };
    }
}

// ── Providers ────────────────────────────────────────────────────────────────

/** Cloudinary's own moderation add-on, applied to an already-uploaded asset. */
async function moderateWithCloudinary(url) {
    const cloudinary = getCloudinary();
    if (!cloudinary) return { ok: false, reason: "no-credentials" };
    const parsed = parseCloudinaryUrl(url);
    if (!parsed) return { ok: false, reason: "not-cloudinary" };

    // Request both engines; whichever the account has enabled answers, the other
    // errors and we ignore that part. Requires the corresponding add-on.
    const engines = ["aws_rekognition_moderation", "google_video_moderation"];
    for (const engine of engines) {
        try {
            const res = await cloudinary.api.moderation_moderate(
                parsed.resourceType,
                parsed.publicId,
                { moderation_type: engine }
            );
            const status = normaliseCloudinaryStatus(res);
            if (status) return { ok: true, provider: `cloudinary:${engine}`, ...status };
        } catch {
            // Engine not enabled on this account — try the next one.
        }
    }
    return { ok: false, reason: "no-enabled-moderation-addon" };
}

function normaliseCloudinaryStatus(res) {
    if (!res) return null;
    // Cloudinary echoes back an array of per-moderation-type results.
    const entries = Array.isArray(res) ? res : [res];
    for (const entry of entries) {
        const status = String(entry.status || "").toLowerCase();
        if (!status) continue;
        const labels = (Array.isArray(entry.moderation_confidence) ? entry.moderation_confidence : [])
            .map((c) => String(c).toLowerCase())
            .filter(Boolean);
        const explicit = status.includes("rejected") || status.includes("pending")
            ? status
            : status;
        return {
            status: explicit,
            labels,
            // Cloudinary does not return a single scalar score, so map the
            // worst label to a conservative pseudo-confidence the shared
            // threshold can act on.
            confidence: worstLabelConfidence(labels, status),
        };
    }
    return null;
}

function worstLabelConfidence(labels, status) {
    if (status && status.includes("rejected")) return 1;
    for (const label of labels) {
        // Order matters and must go most-specific first: a label like
        // "nudity_or_explicit very_likely" contains BOTH the category and a level,
        // and a naive `includes("nudity_or_explicit")` test first would score it
        // as the bare-category case and under-report it below the threshold.
        if (/very[\s_]?likely/.test(label)) return 0.95;
        if (/[\s_]?likely/.test(label)) return 0.8;
        if (label.includes("nudity") || label.includes("explicit") || label.includes("porn")) {
            // Category present with no confidence level at all. Scored just under
            // the 0.8 default so an ambiguous verdict is not auto-blocked.
            return 0.7;
        }
    }
    return 0;
}

/** Google Cloud Vision SafeSearch. REST, no SDK. */
async function moderateWithGoogle(url) {
    const apiKey = process.env.GOOGLE_CLOUD_VISION_API_KEY;
    if (!apiKey) return { ok: false, reason: "no-api-key" };
    if (!/^https:\/\//i.test(url)) return { ok: false, reason: "not-remote-url" };

    const body = {
        requests: [
            {
                image: { source: { imageUri: url } },
                features: [{ type: "SAFE_SEARCH_DETECTION" }],
            },
        ],
    };
    const res = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(apiKey)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { ok: false, reason: `http-${res.status}` };
    const json = await res.json();
    const ss = json.responses && json.responses[0] && json.responses[0].safeSearchAnnotation;
    if (!ss) return { ok: false, reason: "no-annotation" };
    // adult: the nudity signal. violence/racy are separate and out of scope here.
    const bucket = String(ss.adult || "").toUpperCase();
    const confidence = {
        VERY_LIKELY: 0.97,
        LIKELY: 0.8,
        POSSIBLE: 0.45,
        UNLIKELY: 0.1,
        VERY_UNLIKELY: 0.02,
    }[bucket] ?? 0.6;
    return {
        ok: true,
        provider: "google:safesearch",
        status: bucket,
        confidence,
        labels: [bucket],
        raw: { adult: bucket, racy: ss.racy, violence: ss.violence },
    };
}

/**
 * Amazon Rekognition DetectModerationLabels.
 * Deliberately NOT implemented as a live HTTP call: SigV4 signing is non-trivial
 * and getting it subtly wrong produces 403s that look like "no nudity found".
 * Rather than ship a broken detector that silently passes everything, this
 * returns a distinct "not implemented" so the admin UI can say so plainly.
 */
async function moderateWithAws() {
    return { ok: false, reason: "not-configured", notImplemented: true };
}

const PROVIDERS = {
    cloudinary: moderateWithCloudinary,
    google: moderateWithGoogle,
    aws: moderateWithAws,
};

// ── Verdict cache ────────────────────────────────────────────────────────────

const verdictCache = new Map(); // url -> { at, verdict }
const CACHE_MAX = 5000;

function cacheGet(url, ttlHours) {
    if (!ttlHours) return null;
    const hit = verdictCache.get(url);
    if (!hit) return null;
    if (Date.now() - hit.at > ttlHours * 3600 * 1000) {
        verdictCache.delete(url);
        return null;
    }
    return hit.verdict;
}

function cacheSet(url, verdict, ttlHours) {
    if (!ttlHours) return;
    if (verdictCache.size >= CACHE_MAX) {
        // Cheap eviction: drop the oldest insertion.
        const oldest = verdictCache.keys().next().value;
        if (oldest !== undefined) verdictCache.delete(oldest);
    }
    verdictCache.set(url, { at: Date.now(), verdict });
}

function clearVerdictCache() {
    verdictCache.clear();
}

// ── Host allowlist ───────────────────────────────────────────────────────────

/**
 * Structural check: is this URL media we are willing to store at all?
 * This is a real hole independent of nudity — `imageUrl` was previously accepted
 * as an arbitrary string with NO host validation, so a client could store
 * `https://evil.example/x.jpg` in a post and have it rendered for every viewer.
 */
function checkHost(url, settings) {
    const value = String(url || "").trim();
    if (!value) return { ok: true };

    let parsed;
    try {
        parsed = new URL(value);
    } catch {
        return { ok: false, reason: "malformed-url" };
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        return { ok: false, reason: "bad-protocol" };
    }

    const host = parsed.hostname.toLowerCase();
    if (settings.requireCloudinaryHost) {
        if (!CLOUDINARY_HOSTS.has(host)) return { ok: false, reason: "not-cloudinary" };
        // Cloudinary delivery is always HTTPS. Allowing http:// here would let a
        // client downgrade the delivery URL to plaintext and MITM the image.
        if (parsed.protocol !== "https:") return { ok: false, reason: "insecure-protocol" };
    }
    return { ok: true, host };
}

// ── Public API ───────────────────────────────────────────────────────────────

const DEFAULT_MEDIA_SETTINGS = {
    enabled: false,
    provider: "none",
    threshold: 0.8,
    action: "block",
    failureMode: "closed",
    scope: {},
    requireCloudinaryHost: false,
    destroyOnReject: true,
    cacheResults: true,
    cacheTtlHours: 168,
};

/**
 * Merge stored config over the defaults.
 *
 * This previously read `mm.action ? mm : DEFAULTS`, i.e. all-or-nothing. Any
 * partial config (from a hand-edited document, a lean object, or a field added
 * later) silently lost `failureMode`, `requireCloudinaryHost` and `scope` — so a
 * configured host allowlist did nothing and `failureMode: "open"` behaved like
 * "closed". Merging per key is the only correct behaviour here.
 */
function resolveSettings(mm) {
    const stored = mm || {};
    return {
        ...DEFAULT_MEDIA_SETTINGS,
        ...stored,
        scope: { ...DEFAULT_MEDIA_SETTINGS.scope, ...(stored.scope || {}) },
    };
}

async function loadSettings() {
    try {
        const filter = await ContentFilter.findById("singleton").lean();
        return filter || null;
    } catch {
        return null;
    }
}

/**
 * Screen one media URL.
 *
 * @param {string} url                 the delivered media URL
 * @param {object} opts
 * @param {string} opts.surface        "postImage" | "postVideo" | "commentImage" |
 *                                    "story" | "dm" | "group" | "avatar"
 * @param {object} opts.filterDoc      optionally pass an already-loaded filter to
 *                                    avoid a query per URL (posts carry up to 10)
 * @returns {Promise<{allowed:boolean, reason:string, confidence:number, ...}>}
 */
async function screenMediaUrl(url, opts = {}) {
    const filter = opts.filterDoc || (await loadSettings());
    const mm = (filter && filter.mediaModeration) || {};
    const settings = resolveSettings(mm);

    const surfaceEnabled = settings.scope[opts.surface] !== false;
    if (!mm.enabled || !surfaceEnabled) {
        return { allowed: true, reason: "media-moderation-disabled", checked: false };
    }

    // Structural checks run even when no provider is configured — these are the
    // checks that are actually enforceable with zero external dependencies.
    const host = checkHost(url, settings);
    if (!host.ok) {
        return { allowed: false, reason: host.reason, checked: true, structural: true };
    }

    const providerName = settings.provider || "none";
    if (providerName === "none") {
        return {
            allowed: true,
            reason: "no-provider-configured",
            checked: true,
            structural: true,
            note:
                "No image/video classifier is configured, so pixels were NOT examined. " +
                "Set a provider (Cloudinary moderation add-on, Google Vision or AWS Rekognition) " +
                "to actually detect nudity.",
        };
    }

    const cached = settings.cacheResults ? cacheGet(url, settings.cacheTtlHours) : null;
    if (cached) return { ...cached, cached: true };

    const providerFn = PROVIDERS[providerName];
    if (!providerFn) {
        return failure(settings, "unknown-provider");
    }

    let result;
    try {
        result = await providerFn(url);
    } catch (err) {
        return failure(settings, err && err.message ? err.message : "provider-threw");
    }

    if (!result.ok) {
        // A provider that is not configured is a setup problem, not a moderation
        // verdict. Under `failureMode: "closed"` that blocks every upload, which
        // is the safe default but must be visible to the admin.
        return failure(settings, result.reason || "provider-error", result);
    }

    const threshold = Number(settings.threshold ?? 0.8);
    const explicit = Number(result.confidence ?? 0) >= threshold;

    let verdict;
    if (explicit) {
        verdict =
            settings.action === "block"
                ? { allowed: false, reason: "explicit-media", checked: true, ...result }
                : { allowed: true, flagged: true, reason: "explicit-media", checked: true, ...result };
    } else {
        verdict = { allowed: true, reason: "clean", checked: true, ...result };
    }

    if (settings.cacheResults) cacheSet(url, verdict, settings.cacheTtlHours);
    return verdict;
}

function failure(settings, reason, extra = {}) {
    // `reason` is assigned AFTER the spread on purpose: `extra` carries the
    // provider's own reason string, and spreading it afterwards silently
    // overwrote the prefixed one, so callers saw a bare "no-api-key" instead of
    // the "provider-failed:no-api-key" that distinguishes a setup problem from a
    // moderation verdict.
    if (settings.failureMode === "open") {
        return { ...extra, allowed: true, reason: `provider-failed:${reason}`, checked: false };
    }
    return { ...extra, allowed: false, reason: `provider-failed:${reason}`, checked: true, failedClosed: true };
}

/**
 * Screen a list of URLs. Runs sequentially rather than in parallel: a post can
 * carry 10 images, and firing 10 provider calls at once is a good way to get
 * rate-limited by the provider on the very first request.
 *
 * @returns {Promise<{ok:boolean, verdicts:Array, rejected:Array}>}
 */
async function screenMediaList(urls, opts = {}) {
    const verdicts = [];
    const rejected = [];
    for (const url of urls) {
        if (!url) continue;
        // eslint-disable-next-line no-await-in-loop
        const verdict = await screenMediaUrl(url, opts);
        verdicts.push({ url, ...verdict });
        if (!verdict.allowed) rejected.push({ url, ...verdict });
    }
    return { ok: rejected.length === 0, verdicts, rejected };
}

/**
 * Reject helper for route handlers: screen, and on rejection destroy the assets
 * so they are not left publicly fetchable. Returns a value the caller can either
 * send as a response or ignore.
 */
async function enforceMedia(urls, opts = {}) {
    const list = Array.isArray(urls) ? urls.filter(Boolean) : urls ? [urls] : [];
    if (list.length === 0) return { ok: true, rejected: [] };

    const { ok, rejected, verdicts } = await screenMediaList(list, opts);
    if (!ok) {
        const destroy = rejected.some((r) => r.structural) ? false : (opts.destroyOnReject ?? true);
        if (destroy) {
            await Promise.all(rejected.map((r) => destroyAsset(r.url)));
        }
        return {
            ok: false,
            rejected,
            verdicts,
            error: rejected[0].reason,
            // Do not leak the provider's confidence score or labels to the client.
            message: opts.message || "This content was blocked by the automated media filter.",
        };
    }
    return { ok: true, rejected: [], verdicts };
}

module.exports = {
    parseCloudinaryUrl,
    checkHost,
    screenMediaUrl,
    screenMediaList,
    enforceMedia,
    destroyAsset,
    clearVerdictCache,
    loadSettings,
    // exported for tests
    _internal: { normaliseCloudinaryStatus, worstLabelConfidence, CLOUDINARY_HOSTS: Array.from(CLOUDINARY_HOSTS) },
};
