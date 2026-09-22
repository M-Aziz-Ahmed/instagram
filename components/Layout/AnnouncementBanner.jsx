"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

const POLL_MS = 120000;

export default function AnnouncementBanner() {
    const [cfg, setCfg] = useState(null);
    const [dismissed, setDismissed] = useState(() => {
        if (typeof window === "undefined") return [];
        try {
            return JSON.parse(localStorage.getItem("announcementDismissed") || "[]");
        } catch {
            return [];
        }
    });
    const pathname = usePathname();

    useEffect(() => {
        let active = true;
        const load = async () => {
            try {
                const res = await fetch("/api/app/config");
                if (!res.ok) return;
                const data = await res.json();
                if (active) setCfg(data);
            } catch {}
        };
        const t = setTimeout(load, 0);
        const id = setInterval(load, POLL_MS);
        return () => {
            active = false;
            clearTimeout(t);
            clearInterval(id);
        };
    }, []);

    if (!cfg) return null;

    const underMaintenance = cfg.maintenance?.active;
    const isAdminArea = pathname?.startsWith("/admin");

    if (underMaintenance && !isAdminArea) {
        return (
            <div className="fixed inset-0 z-[200] bg-white dark:bg-gray-950 flex items-center justify-center px-6" role="alert">
                <div className="text-center max-w-md">
                    <div className="w-14 h-14 mx-auto mb-5 rounded-2xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-7 h-7 text-amber-500">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17 17.25 21A2.652 2.652 0 0 0 21 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 1 1-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 0 0 4.486-6.336l-3.276 3.277a3.004 3.004 0 0 1-2.25-2.25l3.276-3.276a4.5 4.5 0 0 0-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085" />
                        </svg>
                    </div>
                    <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Under maintenance</h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                        {cfg.maintenance?.message || "We'll be right back — scheduled maintenance."}
                    </p>
                </div>
            </div>
        );
    }

    const visible = (cfg.announcements || []).filter(
        (a) => !dismissed.includes(a.id) && (!a.audience || a.audience === "all")
    );
    if (!visible.length) return null;

    const dismissOne = (id) => {
        const next = [...dismissed, id];
        setDismissed(next);
        try {
            localStorage.setItem("announcementDismissed", JSON.stringify(next));
        } catch {}
    };

    return (
        <div className="space-y-2 px-3 pt-3">
            {visible.map((a) => (
                <div
                    key={a.id}
                    className="relative rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-4 py-3 pr-9"
                    style={{ borderLeft: `3px solid ${a.color || "#1cb0f6"}` }}
                >
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{a.title}</p>
                    {a.body && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">{a.body}</p>}
                    {a.link && (
                        <a href={a.link} target={a.link.startsWith("/") ? undefined : "_blank"} rel="noopener noreferrer"
                            className="text-xs font-semibold text-blue-500 hover:text-blue-600 mt-1 inline-block">
                            Learn more &rarr;
                        </a>
                    )}
                    {a.dismissible !== false && (
                        <button
                            onClick={() => dismissOne(a.id)}
                            aria-label="Dismiss announcement"
                            className="absolute top-2.5 right-2.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                            </svg>
                        </button>
                    )}
                </div>
            ))}
        </div>
    );
}