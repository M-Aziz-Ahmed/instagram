/**
 * Per-session ad bookkeeping.
 *
 * The once-per-creative *execution* guard that used to live here was removed
 * when Adsterra creatives moved to rendering in every slot. It was originally
 * there to stop a creative re-executing on React remount and stacking
 * notification prompts, but the real containment is the `sandbox="allow-scripts"`
 * opaque-origin frame the creative renders in: that denies it our Notification
 * permission, our storage, popups and top-level navigation regardless of how
 * many times it runs. Suppressing repeats on top of that only cost
 * impressions, and produced the worse bug of a single configured ad leaving
 * every slot after the first as an empty placeholder.
 *
 * What's left is impression dedupe. The feed re-renders on a 60s poll and on
 * every scroll-driven append, so without this the same ad would re-report an
 * impression each time its slot happened to reconcile.
 */

const SEEN_ADS_KEY = "at_ads_seen_v1";
const MAX_KEYS = 200;

function readSeenAds() {
    try {
        const raw = JSON.parse(sessionStorage.getItem(SEEN_ADS_KEY) || "[]");
        return new Set(Array.isArray(raw) ? raw : []);
    } catch {
        return new Set();
    }
}

function writeSeenAds(set) {
    try {
        // Bound the list so a long-lived tab can't grow it without limit.
        sessionStorage.setItem(SEEN_ADS_KEY, JSON.stringify([...set].slice(-MAX_KEYS)));
    } catch {
        // storage unavailable (locked-down browser / private mode): ads still
        // render, just without once-per-session dedupe.
    }
}

export function hasSeenAd(key) {
    if (!key) return false;
    return readSeenAds().has(key);
}

export function markAdSeen(key) {
    if (!key) return;
    const set = readSeenAds();
    set.add(key);
    writeSeenAds(set);
}

/**
 * True when the ad can actually paint something.
 *
 * Filters out config stubs so the feed never spends a slot on an ad that can
 * only render an empty box. An Adsterra unit is judged purely on having code —
 * it carries its own image and click-through inside the snippet, so requiring
 * `imageUrl` here would reject perfectly valid creatives.
 */
export function isRenderableAd(ad) {
    if (!ad || ad.isActive === false) return false;
    if (ad.adType === "adsterra") return Boolean(ad.adsterraCode);
    if (ad.adType === "adsense") return Boolean(ad.adsenseSlot);
    return Boolean(ad.imageUrl || ad.title || ad.linkUrl);
}
