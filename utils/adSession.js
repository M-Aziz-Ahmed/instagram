/**
 * Per-session ad bookkeeping.
 *
 * Lives outside AdCard so the feed can *choose* ads that haven't run yet
 * instead of rendering a slot that the component then blanks out. The old
 * behaviour was: the feed picked an ad, the slot mounted, the creative ran
 * once, and every subsequent render of that slot in the same session drew an
 * empty grey 300x250 box. Users saw holes in the feed and the impressions
 * never fired again, so it cost revenue twice over.
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

/** True when this creative has already executed in this tab. */
export function hasRunCreative(ad) {
    if (!ad) return false;
    return hasSeenAd(`run:${ad._id || ad.adsterraCode || ad.adsenseSlot || ad.title}`);
}

/** Mark a creative as executed. */
export function markCreativeRun(ad) {
    if (!ad) return;
    markAdSeen(`run:${ad._id || ad.adsterraCode || ad.adsenseSlot || ad.title}`);
}

/**
 * Order `ads` so the ones that haven't run yet come first, preserving the
 * server's own priority order within each group. The feed then walks the
 * result in order, so slot N gets a fresh creative for as long as fresh
 * creatives exist, and only starts recycling once they're exhausted.
 */
export function prioritizeUnseen(ads) {
    if (!Array.isArray(ads) || ads.length < 2) return Array.isArray(ads) ? ads : [];
    const seen = readSeenAds();
    const fresh = [];
    const stale = [];
    for (const ad of ads) {
        const key = `run:${ad?._id || ad?.adsterraCode || ad?.adsenseSlot || ad?.title}`;
        (seen.has(key) ? stale : fresh).push(ad);
    }
    return fresh.length ? [...fresh, ...stale] : stale;
}

/** True when the ad can actually paint something (not a config stub). */
export function isRenderableAd(ad) {
    if (!ad || ad.isActive === false) return false;
    if (ad.adType === "adsterra") return Boolean(ad.adsterCode || ad.adsterraCode);
    if (ad.adType === "adsense") return Boolean(ad.adsenseSlot);
    return Boolean(ad.imageUrl || ad.title || ad.linkUrl);
}
