"use client";

import { useEffect, useMemo, useRef, useState } from "react";

// Ad creatives are arbitrary HTML/JS pasted by an admin. They used to be
// injected with `document.write` into a same-origin, unsandboxed iframe, which
// meant a "push notification"/"social bar" style ad could:
//   • call the real Notification API and stack OS-level toasts forever
//     (re-arming itself on a timer, once per ad slot that mounted), and
//   • read/write our DOM, cookies and localStorage.
// That is what made notifications fire endlessly on /social with no context.
//
// The creative now renders through `srcdoc` in a `sandbox="allow-scripts"`
// iframe, which gives it an *opaque* origin: no DOM/cookie/storage access, no
// access to our Notification permission, and it can only paint inside its own
// 300x250 frame. Combined with the once-per-session guard below, a creative
// executes at most once per session no matter how often React remounts it.

const SEEN_ADS_KEY = "at_ads_seen_v1";

function readSeenAds() {
    try {
        const raw = JSON.parse(sessionStorage.getItem(SEEN_ADS_KEY) || "[]");
        return new Set(Array.isArray(raw) ? raw : []);
    } catch {
        return new Set();
    }
}

function hasSeenAd(key) {
    return readSeenAds().has(key);
}

function markAdSeen(key) {
    try {
        const set = readSeenAds();
        set.add(key);
        // Bound the list so a long-lived tab can't grow it without limit.
        sessionStorage.setItem(SEEN_ADS_KEY, JSON.stringify([...set].slice(-200)));
    } catch {
        // storage unavailable (locked-down browser): ads still render, just
        // without the once-per-session dedupe.
    }
}

function adDoc(code) {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>*{margin:0;padding:0;border:0;overflow:hidden;}html,body{overflow:hidden;width:100%;height:100%;font-family:system-ui,sans-serif;}</style></head><body>${code}</body></html>`;
}

function AdsterraAd({ adId, code }) {
    const key = adId || code;

    // Decide during render from a *read* only, so the value is stable across
    // StrictMode's double render. Recording the decision is a separate
    // write-only effect below. Reading it back on the next mount is what stops
    // a remounted slot from executing the creative a second time.
    const srcDoc = useMemo(() => {
        // Never run a creative while the tab is in the background: those ads
        // are built to fire on a timer the moment they load.
        if (typeof document !== "undefined" && document.hidden) return null;
        if (hasSeenAd(key)) return null;
        return adDoc(code);
    }, [key, code]);

    useEffect(() => {
        if (srcDoc) markAdSeen(key);
    }, [srcDoc, key]);

    // Reserve the slot's space even before the creative loads, so injecting it
    // does not shove the feed around.
    return (
        <div className="border-b border-gray-200 dark:border-gray-800 px-4 py-3 text-center">
            <span className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wider font-medium">Sponsored</span>
            <div className="flex justify-center mt-2">
                {srcDoc ? (
                    <iframe
                        title="Sponsored"
                        width="300"
                        height="250"
                        className="border-0 overflow-hidden rounded"
                        sandbox="allow-scripts"
                        referrerPolicy="no-referrer"
                        loading="lazy"
                        srcDoc={srcDoc}
                    />
                ) : (
                    <div
                        aria-hidden="true"
                        style={{ width: 300, height: 250 }}
                        className="rounded bg-gray-100 dark:bg-gray-800"
                    />
                )}
            </div>
        </div>
    );
}

export default function AdCard({ ad }) {
    const ref = useRef(null);
    const [clicked, setClicked] = useState(false);

    useEffect(() => {
        if (!ad?._id) return;
        // Count an ad once per session per creative, matching the injection
        // guard — otherwise every remount inflated the impression counter.
        const key = `imp:${ad._id}`;
        if (hasSeenAd(key)) return;
        markAdSeen(key);
        fetch(`/api/admin/ads/${ad._id}/track`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "impression" }),
        }).catch(() => {});
    }, [ad?._id]);

    if (!ad) return null;

    const handleClick = async () => {
        if (clicked) return;
        setClicked(true);
        fetch(`/api/admin/ads/${ad._id}/track`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "click" }),
        }).catch(() => {});

        if (ad.linkUrl) {
            window.open(ad.linkUrl, "_blank", "noopener,noreferrer");
        }
    };

    // AdSense
    if (ad.adType === "adsense" && ad.adsenseSlot) {
        return (
            <div ref={ref} className="border-b border-gray-200 dark:border-gray-800 px-4 py-4">
                <span className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wider font-medium">Sponsored</span>
                <ins
                    className="adsbygoogle mt-2"
                    style={{ display: "block" }}
                    data-ad-client="ca-pub-XXXXXXXXXX"
                    data-ad-slot={ad.adsenseSlot}
                    data-ad-format="auto"
                    data-full-width-responsive="true"
                />
            </div>
        );
    }

    // Adsterra (or any raw-HTML creative)
    if (ad.adType === "adsterra" && ad.adsterraCode) {
        return <AdsterraAd adId={ad._id} code={ad.adsterraCode} />;
    }

    // Custom ad
    return (
        <div
            ref={ref}
            className="border-b border-gray-200 dark:border-gray-800 px-4 py-4 cursor-pointer"
            onClick={handleClick}
        >
            <span className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wider font-medium">Sponsored</span>
            {ad.imageUrl && (
                <img
                    src={ad.imageUrl}
                    alt={ad.title}
                    className="w-full h-48 object-cover mt-2 rounded-xl"
                    loading="lazy"
                />
            )}
            <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100 mt-2">{ad.title}</h4>
            {ad.description && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">{ad.description}</p>
            )}
            {ad.linkUrl && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-500 hover:text-blue-600 mt-2">
                    {ad.ctaText || "Learn More"}
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3 h-3">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                    </svg>
                </span>
            )}
        </div>
    );
}
