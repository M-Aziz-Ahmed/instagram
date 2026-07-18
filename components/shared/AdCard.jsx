"use client";

import { useEffect, useRef, useState } from "react";

function AdsterraAd({ code }) {
    const containerRef = useRef(null);

    useEffect(() => {
        if (!containerRef.current) return;
        const container = containerRef.current;

        const frag = document.createRange().createContextualFragment(code);
        container.appendChild(frag);

        const scripts = container.querySelectorAll("script");
        scripts.forEach((old) => {
            const s = document.createElement("script");
            if (old.src) s.src = old.src;
            else s.textContent = old.textContent;
            document.body.appendChild(s);
            old.remove();
        });

        return () => { container.innerHTML = ""; };
    }, [code]);

    return (
        <div ref={containerRef} className="my-4 px-4">
            <div className="flex items-center gap-1.5 mb-1.5">
                <span className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wider font-medium">Ad</span>
            </div>
        </div>
    );
}

export default function AdCard({ ad }) {
    const ref = useRef(null);
    const [clicked, setClicked] = useState(false);

    // Track impression on mount
    useEffect(() => {
        if (!ad?._id) return;
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
        // Track click
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
            <div ref={ref} className="my-4 px-4">
                <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wider font-medium">Ad</span>
                </div>
                <ins
                    className="adsbygoogle"
                    style={{ display: "block" }}
                    data-ad-client="ca-pub-XXXXXXXXXX"
                    data-ad-slot={ad.adsenseSlot}
                    data-ad-format="auto"
                    data-full-width-responsive="true"
                />
            </div>
        );
    }

    // Adsterra
    if (ad.adType === "adsterra" && ad.adsterraCode) {
        return <AdsterraAd code={ad.adsterraCode} />;
    }

    // Custom ad
    return (
        <div
            ref={ref}
            className="my-4 mx-4 border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden bg-gray-50 dark:bg-gray-900/50 cursor-pointer hover:shadow-md transition-shadow"
            onClick={handleClick}
        >
            <div className="flex items-center gap-1.5 px-3 pt-2.5">
                <span className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wider font-medium">Sponsored</span>
            </div>
            {ad.imageUrl && (
                <img
                    src={ad.imageUrl}
                    alt={ad.title}
                    className="w-full h-48 object-cover mt-2"
                    loading="lazy"
                />
            )}
            <div className="p-3">
                <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100">{ad.title}</h4>
                {ad.description && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">{ad.description}</p>
                )}
                {ad.linkUrl && (
                    <div className="mt-2.5">
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-500 hover:text-blue-600">
                            {ad.ctaText || "Learn More"}
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3 h-3">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                            </svg>
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
}
