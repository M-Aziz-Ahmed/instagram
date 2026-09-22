"use client";

// Reports a page_view beacon on every navigation. Mounted once in the root
// layout; listens to the router pathname so client-side transitions count.
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { trackPage } from "@/utils/track";

export default function TrackPage() {
    const pathname = usePathname();
    const lastRef = useRef({ path: "", at: 0 });

    useEffect(() => {
        const now = Date.now();
        const last = lastRef.current;
        if (pathname === last.path && now - last.at < 15000) return;
        lastRef.current = { path: pathname, at: now };
        // Defer so the lookup doesn't fight with route render work.
        const t = setTimeout(trackPage, 800);
        return () => clearTimeout(t);
    }, [pathname]);

    return null;
}