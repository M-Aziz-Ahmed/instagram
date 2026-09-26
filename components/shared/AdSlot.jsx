"use client";

import { useEffect, useState } from "react";
import AdCard from "@/components/shared/AdCard";
import { isRenderableAd } from "@/utils/adSession";

// A single ad slot for a page that is not the social feed.
//
// The feed does its own thing: it interleaves several creatives into a post
// list, so it manages its own fetching. Every other surface just wants "one ad
// for this placement", which is what this component is for.
//
// Two things it deliberately does NOT do:
//   • it renders nothing when there is no ad, rather than a grey box. A page
//     that has no campaign configured should look like a page with no ads, not
//     like a broken image.
//   • it does not retry in a loop. A failed request stays failed for the life of
//     the mount, so a downed ad endpoint cannot hammer the server as the user
//     navigates around.
//
// It does not check Pro status itself. /api/ads returns an empty array for a
// Pro viewer, so ad-free is enforced on the server rather than being a rule each
// placement has to remember to implement.
export default function AdSlot({ slot, limit = 1, className = "" }) {
    const [ad, setAd] = useState(null);
    const [checked, setChecked] = useState(false);

    useEffect(() => {
        let cancelled = false;
        setAd(null);
        setChecked(false);

        fetch(`/api/ads?slot=${encodeURIComponent(slot)}&limit=${limit}`, {
            cache: "no-store",
        })
            .then((r) => (r.ok ? r.json() : []))
            .then((data) => {
                if (cancelled) return;
                const list = Array.isArray(data) ? data.filter(isRenderableAd) : [];
                setAd(list[0] || null);
                setChecked(true);
            })
            .catch(() => {
                if (!cancelled) setChecked(true);
            });

        return () => {
            cancelled = true;
        };
    }, [slot, limit]);

    if (!checked || !ad) return null;

    return (
        <aside
            className={className}
            // Screen readers get the same "this is a paid placement" signal the
            // visual Sponsored label gives everyone else.
            aria-label="Sponsored"
        >
            <AdCard ad={ad} />
        </aside>
    );
}
