"use client";

import { useEffect, useRef, useState } from "react";

function AdsterraAd({ code }) {
    const iframeRef = useRef(null);

    useEffect(() => {
        const iframe = iframeRef.current;
        if (!iframe) return;

        const doc = iframe.contentDocument || iframe.contentWindow.document;
        doc.open();
        doc.write(`<!DOCTYPE html><html><head><style>*{margin:0;padding:0;border:0;}</style></head><body>${code}</body></html>`);
        doc.close();
    }, [code]);

    return (
        <div className="border-b border-gray-200 dark:border-gray-800 px-4 py-3 text-center">
            <span className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wider font-medium">Sponsored</span>
            <div className="flex justify-center mt-2">
                <iframe
                    ref={iframeRef}
                    width="300"
                    height="250"
                    className="border-0"
                    loading="lazy"
                    title="Sponsored"
                />
            </div>
        </div>
    );
}

export default function AdCard({ ad }) {
    const ref = useRef(null);
    const [clicked, setClicked] = useState(false);

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

    // Adsterra
    if (ad.adType === "adsterra" && ad.adsterraCode) {
        return <AdsterraAd code={ad.adsterraCode} />;
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
