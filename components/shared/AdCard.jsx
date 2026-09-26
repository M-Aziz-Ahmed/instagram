"use client";

import { useEffect, useRef, useState } from "react";
import { hasRunCreative, markCreativeRun, hasSeenAd, markAdSeen } from "@/utils/adSession";
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

function AdSenseSlot({ ad }) {
    const insRef = useRef(null);
    const [status, setStatus] = useState("loading"); // loading | ready | failed

    // A publisher id can be pinned per-ad (useful when rotating between
    // accounts); otherwise fall back to the site-wide build-time value.
    const client =
        ad.adsenseClient ||
        (typeof process !== "undefined" ? process.env.NEXT_PUBLIC_ADSENSE_CLIENT : "") ||
        "";
    // Without a publisher id there is nothing to request, so the slot is
    // unfillable by definition and we don't mount a loader for it.
    const unconfigured = !client;

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

    if (unconfigured || status === "failed") {
        return (
            <UnavailableAd
                reason={
                    unconfigured
                        ? "No AdSense publisher ID configured."
                        : "This ad slot has no fill."
                }
            />
        );
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
// The creative paints, but it does NOT get to navigate. It is loaded through
// `srcdoc` in a `sandbox="allow-scripts"` iframe, and the sandbox grants an
// opaque origin with no `allow-popups`, so the browser itself refuses every
// `window.open`, `top.location` write and form submit coming out of it. That is
// deliberate: these units are frequently push-notification and social-bar
// creatives whose whole business model is opening windows on a timer, and with
// popups permitted they stack up until the tab is unusable.
//
// Consequence: the creative cannot service its own click-through, so we do it.
// The absolutely-positioned overlay below sits on top of the creative and
// handles the click — tracking it and opening the landing page ourselves. Same
// revenue, none of the abuse.

function AdsterraAd({ ad, onTrackClick }) {
    const { adsterraCode: code, adSize: size } = ad;
    // Decide during render from a *read* only, so the value is stable across
    // StrictMode's double render. Recording the decision is a separate
    // write-only effect below.
    const shouldRun = (() => {
        // Never run a creative while the tab is in the background: those ads
        // are built to fire on a timer the moment they load.
        if (typeof document !== "undefined" && document.hidden) return false;
        return !hasRunCreative(ad);
    })();

    useEffect(() => {
        if (shouldRun) markCreativeRun(ad);
    }, [shouldRun, ad]);

    const { width, height } = parseSize(size);

    if (!shouldRun) return <UnavailableAd reason="Ad already shown in this session." />;

    return (
        <div className="px-4 py-3 text-center">
            <SponsoredLabel />
            <div
                className="relative mt-2 mx-auto overflow-hidden rounded-xl"
                style={{ maxWidth: width, height }}
            >
                <iframe
                    title="Sponsored"
                    className="pointer-events-none absolute inset-0 h-full w-full border-0"
                    // No allow-popups, no allow-top-navigation, no
                    // allow-forms, no allow-same-origin. Scripts only, in an
                    // opaque origin.
                    sandbox="allow-scripts"
                    referrerPolicy="no-referrer"
                    loading="lazy"
                    srcDoc={adDoc(code)}
                />
                {ad.linkUrl && (
                    <button
                        type="button"
                        onClick={() => onTrackClick(ad)}
                        className="absolute inset-0 w-full cursor-pointer rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                        aria-label={ad.title ? `Sponsored: ${ad.title}` : "Sponsored ad"}
                    />
                )}
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
 * Shown when a slot has nothing to paint. A flat grey rectangle reads as a
 * broken image, so this is a deliberately quiet, honest placeholder: it keeps
 * the layout stable and labels the gap rather than pretending to be content.
 */
function UnavailableAd({ reason }) {
    return (
        <div className="px-4 py-3">
            <SponsoredLabel />
            <div className="mt-2 mx-auto max-w-[300px] rounded-xl border border-dashed border-gray-300 dark:border-gray-700 px-4 py-5 text-center">
                <p className="text-[11px] text-gray-400 dark:text-gray-500 leading-relaxed">{reason}</p>
            </div>
        </div>
    );
}

function adDoc(code) {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>*{margin:0;padding:0;border:0;overflow:hidden;}html,body{overflow:hidden;width:100%;height:100%;font-family:system-ui,sans-serif;}</style></head><body>${code}</body></html>`;
}

/**
 * Parse a "300x250" / "728x90" creative size. Falls back to the 300x250
 * median rectangle that most networks default to, and stays responsive on
 * narrow viewports by letting CSS clamp the width.
 */
function parseSize(size) {
    const m = /^(\d{2,4})\s*[x×*]\s*(\d{2,4})$/i.exec(String(size || "").trim());
    if (!m) return { width: 300, height: 250 };
    return { width: Math.min(parseInt(m[1], 10), 970), height: Math.min(parseInt(m[2], 10), 1000) };
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
        return <AdSenseSlot ad={ad} />;
    }

    if (ad.adType === "adsterra" && ad.adsterraCode) {
        return <AdsterraAd ad={ad} onTrackClick={handleClick} />;
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
