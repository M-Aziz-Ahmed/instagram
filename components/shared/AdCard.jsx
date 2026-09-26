"use client";

import { useEffect, useRef, useState } from "react";
import { hasSeenAd, markAdSeen } from "@/utils/adSession";
import { openAdLink } from "@/utils/popupGuard";

// Ad creatives are arbitrary HTML/JS pasted by an admin. They used to be
// injected with `document.write` into a same-origin, unsandboxed iframe, which
// meant a "push notification"/"social bar" style ad could:
//   • call the real Notification API and stack OS-level toasts forever
//     (re-arming itself on a timer, once per ad slot that mounted), and
//   • read/write our DOM, cookies and localStorage.
// That is what made notifications fire endlessly on /social with no context.
//
// The creative still renders through `srcdoc` in a `sandbox`ed iframe, which
// gives it an *opaque* origin: no DOM/cookie/storage access and no access to
// our Notification permission. Two things were added on top of that without
// weakening the isolation:
//   • `allow-popups allow-popups-to-escape-sandbox` so a click-through can
//     actually open the landing page. Without it the sandbox silently swallows
//     every click and the ad earns nothing.
//   • `allow-scripts allow-same-origin` is deliberately NOT granted.
// See utils/adSession.js for the once-per-session execution guard.

// ── AdSense ─────────────────────────────────────────────────────
// The AdSense branch used to render a bare <ins> with a hardcoded
// `ca-pub-XXXXXXXXXX`, never load adsbygoogle.js and never call
// adsbygoogle.push(). That produced a zero-height invisible element on every
// slot: ads "didn't work" because nothing was ever requested. This loads the
// real library once per page and pushes a real ad request per slot.

let adsenseLoader = null;
// Runtime publisher id, fetched once. See /api/ads/config — this exists so the
// live server can supply the id without the frontend being rebuilt.
let adsenseClientPromise = null;

function resolveBuildTimeClient() {
    return (
        (typeof process !== "undefined" && process.env.NEXT_PUBLIC_ADSENSE_CLIENT) || ""
    );
}

function getRuntimeClient() {
    if (adsenseClientPromise) return adsenseClientPromise;
    const buildTime = resolveBuildTimeClient();
    if (buildTime) {
        adsenseClientPromise = Promise.resolve(buildTime);
        return adsenseClientPromise;
    }
    adsenseClientPromise = fetch("/api/ads/config", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => d?.adsenseClient || "")
        .catch(() => "");
    return adsenseClientPromise;
}

function loadAdSense(client) {
    if (typeof window === "undefined") return Promise.resolve(false);
    // Some ad networks refuse to serve inside a sandboxed/privacy-hardened
    // context; if the library is already present we can use it as-is.
    if (window.adsbygoogle) return Promise.resolve(true);

    if (!adsenseLoader) {
        adsenseLoader = new Promise((resolve) => {
            const s = document.createElement("script");
            s.async = true;
            s.crossOrigin = "anonymous";
            s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(
                client,
            )}`;
            s.onload = () => resolve(true);
            s.onerror = () => resolve(false);
            document.head.appendChild(s);
        });
    }
    return adsenseLoader;
}

function AdSenseSlot({ ad, onFallbackClick }) {
    const insRef = useRef(null);
    const [status, setStatus] = useState("loading"); // loading | ready | failed
    const [client, setClient] = useState(ad.adsenseClient || resolveBuildTimeClient());

    // A publisher id can be pinned per-ad (useful when rotating between
    // accounts); otherwise fall back to the site-wide value, fetched from the
    // live server so it can be configured without a frontend rebuild.
    // The per-ad value is already the initial state, so there is nothing to
    // write when it's present.
    useEffect(() => {
        if (ad.adsenseClient) return;
        let cancelled = false;
        getRuntimeClient().then((c) => {
            if (!cancelled) setClient(c);
        });
        return () => {
            cancelled = true;
        };
    }, [ad.adsenseClient]);

    useEffect(() => {
        if (!client) return;
        let cancelled = false;
        (async () => {
            const ok = await loadAdSense(client);
            if (cancelled) return;
            if (!ok || !window.adsbygoogle) {
                setStatus("failed");
                return;
            }
            try {
                // The push *is* the ad request. Skipping it is exactly what
                // left the slot invisible before.
                (window.adsbygoogle = window.adsbygoogle || []).push({});
                setStatus("ready");
            } catch {
                setStatus("failed");
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [client]);

    // Detect a slot that filled with no creative (no fill / blocked request).
    useEffect(() => {
        if (status !== "ready") return;
        const el = insRef.current;
        if (!el) return;

        const unfilled = () => {
            const adslot = el.querySelector(":scope > div[id^='google_ads_iframe']");
            if (!adslot) return;
            if (!adslot.querySelector("iframe") && el.offsetHeight < 60) setStatus("failed");
        };

        const onLoad = (e) => {
            if (e.target === el) setTimeout(unfilled, 400);
        };
        // adsbygoogle dispatches a bubbling "adsbygoogle:load" once rendered.
        el.addEventListener("adsbygoogle:load", onLoad);
        const poll = setTimeout(unfilled, 2500);

        return () => {
            el.removeEventListener("adsbygoogle:load", onLoad);
            clearTimeout(poll);
        };
    }, [status]);

    // No publisher id, or a request that came back empty. The slot can't paint
    // a creative, but it can still earn: if the ad carries artwork we fall back
    // to the static promo card so the impression and the click are kept. Only a
    // genuinely artless ad drops to the bare placeholder.
    if (!client || status === "failed") {
        if (process.env.NODE_ENV !== "production") {
            console.warn(
                !client
                    ? `[AdCard] Ad "${ad.title}" is an AdSense unit but no publisher id is configured. Set ADSENSE_CLIENT on the live server, NEXT_PUBLIC_ADSENSE_CLIENT in the frontend env, or fill in Publisher ID on the ad.`
                    : `[AdCard] Ad "${ad.title}" (slot ${ad.adsenseSlot}) requested no creative. AdSense will not serve a slot with no fill.`,
            );
        }
        return ad.imageUrl ? <HouseAd ad={ad} onClick={onFallbackClick} /> : <UnavailableAd />;
    }

    return (
        <div className="px-4 py-4">
            <SponsoredLabel />
            <ins
                ref={insRef}
                className="adsbygoogle block mx-auto"
                style={{ display: "block", minHeight: 90 }}
                data-ad-client={client}
                data-ad-slot={ad.adsenseSlot}
                data-ad-format="auto"
                data-full-width-responsive="true"
            />
        </div>
    );
}

// ── Adsterra / raw-HTML creative ───────────────────────────────
//
// How this is isolated:
//
// The creative is loaded through `srcdoc` in a `sandbox="allow-scripts"` iframe.
// That sandbox deliberately withholds `allow-same-origin`, `allow-popups`,
// `allow-top-navigation`, `allow-forms` and `allow-modals`, and an opaque
// origin means it also has no access to this app's cookies, storage, DOM or the
// Notification permission. The browser — not our code — is what refuses the
// popup storm, the notification hijack and the `top.location` redirect that
// these push/social-bar units otherwise rely on.
//
// The creative is deliberately left INTERACTIVE. A standard Adsterra display
// banner ships its own image and click-through inside the snippet, so covering
// it with an overlay (as an earlier revision did) served no purpose and left
// the impression rendering with nothing to click. Clicks are handled by the
// creative inside its own frame; the sandbox still blocks any window it tries
// to open.
//
// Every slot renders the creative. The previous revision executed it only once
// per session, which meant that with a single configured ad every slot after
// the first fell back to an empty placeholder — the sandbox, not the
// once-per-session flag, is what actually contains these units, so suppressing
// repeats only cost impressions.

function AdsterraAd({ ad }) {
    const { adsterraCode: code, adSize: size } = ad;
    if (!code) return <UnavailableAd />;

    // Prefer the size the snippet itself declares, so the frame can never
    // clip the creative to a blank box because the two disagreed.
    const { width, height } = parseSize(size, code);

    return (
        <div className="px-4 py-3 text-center">
            <SponsoredLabel />
            <div
                className="relative mx-auto mt-2 overflow-hidden rounded-xl"
                style={{ width: "100%", maxWidth: width, height }}
            >
                <iframe
                    title={ad.title ? `Sponsored: ${ad.title}` : "Sponsored"}
                    className="absolute inset-0 h-full w-full border-0"
                    sandbox="allow-scripts"
                    referrerPolicy="no-referrer"
                    // Deliberately NOT loading="lazy". A slot near the top of the
                    // feed is above the fold, and a lazy srcdoc iframe there can
                    // defer its load past the point the user is actually looking,
                    // which reads as a blank ad slot. There are at most
                    // MAX_AD_SLOTS of these per page, so eager loading is cheap.
                    scrolling="no"
                    srcDoc={adDoc(code, width, height)}
                />
            </div>
        </div>
    );
}

// ── Shared pieces ───────────────────────────────────────────────

function SponsoredLabel() {
    return (
        <div className="flex items-center justify-center gap-1.5">
            <span className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-[0.12em] font-semibold">
                Sponsored
            </span>
        </div>
    );
}

/**
 * Shown when a slot has nothing to paint.
 *
 * This used to surface a diagnostic string ("Ad already shown in this
 * session"), which read like a bug report to users. A flat grey rectangle
 * reads as a broken image, and a sentence explaining the ad machinery reads as
 * an error. So the gap is filled with a quiet branded card instead: honest
 * about being an ad, deliberate about the space it occupies.
 */
function UnavailableAd() {
    return (
        <div className="px-4 py-3">
            <SponsoredLabel />
            <div
                className="mt-2 mx-auto max-w-[300px] rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-4 py-5 text-center"
                aria-hidden="true"
            >
                <div className="mx-auto mb-2.5 h-9 w-9 rounded-xl bg-[var(--brand-gradient)] opacity-90" />
                <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">
                    Advertisement
                </p>
            </div>
        </div>
    );
}

/**
 * Static promo card. Used for a creative that has already run this session but
 * has artwork: the image and the click-through still work, only the script is
 * withheld. Keeps every slot monetised without re-running a creative that has
 * already had its one execution.
 */
function HouseAd({ ad, onClick }) {
    return (
        <div className="px-4 py-4">
            <SponsoredLabel />
            <div
                role="link"
                tabIndex={0}
                onClick={onClick}
                onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onClick(e);
                    }
                }}
                className="group mt-2 block cursor-pointer overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] transition-colors hover:border-[var(--brand-400)]"
            >
                {ad.imageUrl && (
                    <img src={ad.imageUrl} alt={ad.title} className="h-48 w-full object-cover" loading="lazy" />
                )}
                <div className="p-3.5">
                    <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100">{ad.title}</h4>
                    {ad.description && (
                        <p className="mt-1 line-clamp-2 text-xs text-gray-500 dark:text-gray-400">
                            {ad.description}
                        </p>
                    )}
                    {ad.linkUrl && (
                        <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[var(--brand-600)] transition-all group-hover:gap-1.5 dark:text-[var(--brand-300)]">
                            {ad.ctaText || "Learn More"}
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-3 w-3">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                            </svg>
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
}

function adDoc(code, width, height) {
    return (
        `<!DOCTYPE html><html><head><meta charset="utf-8">` +
        // The creative is laid out in an opaque-origin frame with no access to
        // the parent, so it has to be told how much room it has. Network
        // inventory and any transparent background are forced out, since
        // Adsterra's `invoke.js` drops tracking pixels by default and this
        // position is a display slot, not a performance budget.
        `<style>html,body{margin:0;padding:0;border:0;width:${width}px;height:${height}px;` +
        `max-width:100%;overflow:hidden;background:#fff;}` +
        `body{font-family:system-ui,-apple-system,sans-serif;}` +
        `iframe{border:0;display:block;max-width:100%;}` +
        `</style></head><body>${code}</body></html>`
    );
}

/**
 * Resolve the creative's box.
 *
 * The snippet itself declares the size (Adsterra's `atOptions` carries
 * `width` and `height`), so that is read first — the whole class of "size must
 * match the dashboard" bugs disappears when the frame is sized from the same
 * source of truth the network uses. An explicit `adSize` on the record wins
 * when set, which is how an admin overrides a snippet that misreports.
 *
 * Falls back to the 300x250 median rectangle, and stays responsive on narrow
 * viewports by letting CSS clamp the width.
 */
function parseSize(size, code) {
    const clamp = (w, h) => ({
        width: Math.min(Math.max(w, 1), 970),
        height: Math.min(Math.max(h, 1), 1000),
    });

    const explicit = /^(\d{2,4})\s*[x×*]\s*(\d{2,4})$/i.exec(String(size || "").trim());
    if (explicit) return clamp(parseInt(explicit[1], 10), parseInt(explicit[2], 10));

    // e.g. 'width' : '300',  'height' : '250'
    const w = /['"]?width['"]?\s*[:=]\s*['"]?(\d{2,4})/i.exec(String(code || ""));
    const h = /['"]?height['"]?\s*[:=]\s*['"]?(\d{2,4})/i.exec(String(code || ""));
    if (w && h) return clamp(parseInt(w[1], 10), parseInt(h[1], 10));

    return { width: 300, height: 250 };
}

export default function AdCard({ ad }) {
    const [clicked, setClicked] = useState(false);

    useEffect(() => {
        if (!ad?._id) return;
        // Count an ad once per session per creative, matching the execution
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

    // One click path for every ad type. It always runs from a real user gesture
    // (our own button or overlay), which is what lets the popup blocker tell an
    // intentional click-through apart from a creative that opens windows on a
    // timer. See utils/popupGuard.js.
    const handleClick = (e) => {
        if (clicked) return;
        setClicked(true);
        if (!ad._id) return;
        fetch(`/api/admin/ads/${ad._id}/track`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "click" }),
        }).catch(() => {});
        if (ad.linkUrl) {
            e?.preventDefault?.();
            openAdLink(ad.linkUrl);
        }
    };

    if (ad.adType === "adsense" && ad.adsenseSlot) {
        return <AdSenseSlot ad={ad} onFallbackClick={handleClick} />;
    }

    if (ad.adType === "adsterra" && ad.adsterraCode) {
        return <AdsterraAd ad={ad} />;
    }

    // Custom ad
    return (
        <div className="px-4 py-4">
            <SponsoredLabel />
            <div
                role="link"
                tabIndex={0}
                onClick={handleClick}
                onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleClick(e);
                    }
                }}
                className="group mt-2 block cursor-pointer rounded-2xl border border-[var(--border-subtle)] overflow-hidden bg-[var(--surface-raised)] hover:border-[var(--brand-400)] transition-colors"
            >
                {ad.imageUrl && (
                    <img
                        src={ad.imageUrl}
                        alt={ad.title}
                        className="w-full h-48 object-cover"
                        loading="lazy"
                    />
                )}
                <div className="p-3.5">
                    <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100">{ad.title}</h4>
                    {ad.description && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                            {ad.description}
                        </p>
                    )}
                    {ad.linkUrl && (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--brand-600)] dark:text-[var(--brand-300)] mt-2 group-hover:gap-1.5 transition-all">
                            {ad.ctaText || "Learn More"}
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                fill="none"
                                viewBox="0 0 24 24"
                                strokeWidth={2}
                                stroke="currentColor"
                                className="w-3 h-3"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"
                                />
                            </svg>
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
}
