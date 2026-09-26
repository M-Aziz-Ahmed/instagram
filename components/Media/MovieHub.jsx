"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Tabs, { PanelSkeleton } from "@/components/ui/Tabs";
import MediaPage from "@/components/Media/MediaPage";
import AnimePage from "@/components/Anime/AnimePage";
import LiveTVPage from "@/components/LiveTV/LiveTVPage";
import { getMediaSource } from "@/live-server/utils/mediaSources";
import {
    DEFAULT_HUB_TAB,
    HUB_TAB_ICONS,
    MOVIE_HUB_TABS,
    getHubTab,
    isHubTab,
} from "@/components/Media/movieHubTabs";

/**
 * Movie Hub — the single watch surface for everything that plays video.
 *
 * Previously each category was its own route with its own page shell, so moving
 * between a drama and a cartoon meant a full navigation, a fresh search box and
 * a different visual language. This keeps one shell and swaps only the content
 * panel, which is both faster and what people expect from a streaming product.
 *
 * The active tab lives in `?tab=`, and the child page owns the rest of the
 * query (`id`, `ep`). That split matters: it means a link to a specific episode
 * is shareable, the back button walks the drill-down, and switching tabs
 * cleanly discards another category's selection instead of trying to restore it.
 */
export default function MovieHub() {
    const router = useRouter();
    const searchParams = useSearchParams();

    const tabParam = searchParams.get("tab");
    const activeTab = isHubTab(tabParam) ? tabParam : DEFAULT_HUB_TAB;
    const tab = getHubTab(activeTab);

    // Children mount asynchronously (three different page components, one of
    // which is a 750-line module). Rendering a skeleton for the first paint
    // avoids a flash of empty content on every navigation into the hub.
    const [ready, setReady] = useState(false);
    const shellRef = useRef(null);

    useEffect(() => {
        // One frame after the header paints, so the skeleton never fights the
        // header for layout.
        const id = requestAnimationFrame(() => setReady(true));
        return () => cancelAnimationFrame(id);
    }, []);

    const handleTabChange = useCallback(
        (next) => {
            if (next === activeTab) return;
            // Drop id/ep: they belong to the category we're leaving.
            router.push(`/watch?tab=${next}`, { scroll: false });
        },
        [activeTab, router],
    );

    const tabs = useMemo(
        () =>
            MOVIE_HUB_TABS.map((t) => ({
                id: t.id,
                label: t.label,
                icon: (
                    <span className="[&>svg]:h-4 [&>svg]:w-4">
                        {HUB_TAB_ICONS[t.id]}
                    </span>
                ),
            })),
        [],
    );

    return (
        <div className="min-h-dvh app-bg">
            <HubHeader tab={tab} />

            <div className="app-header">
                <div className="max-w-7xl mx-auto px-3 sm:px-5">
                    <Tabs
                        tabs={tabs}
                        value={activeTab}
                        onChange={handleTabChange}
                        label="Categories"
                    />
                </div>
            </div>

            <main className="max-w-7xl mx-auto px-3 sm:px-5 py-5 sm:py-7" ref={shellRef}>
                {!ready ? (
                    <PanelSkeleton count={16} />
                ) : (
                    <TabPanel key={activeTab} tab={tab} />
                )}
            </main>
        </div>
    );
}

function TabPanel({ tab }) {
    if (tab.kind === "anime") return <AnimePage embedded />;
    if (tab.kind === "live-tv") return <LiveTVPage embedded />;
    return (
        <MediaPage
            key={tab.id}
            mediaType={tab.mediaType}
            config={getMediaSource(tab.mediaType)}
            embedded
            baseQuery={`tab=${tab.id}`}
        />
    );
}

function HubHeader({ tab }) {
    return (
        <header className="app-header">
            <div className="relative overflow-hidden">
                {/* Brand wash behind the header — purely decorative. */}
                <div
                    aria-hidden="true"
                    className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${tab.accent} opacity-[0.14] dark:opacity-20`}
                />
                <div className="relative max-w-7xl mx-auto px-3 sm:px-5 pt-4 pb-4 sm:pt-6 sm:pb-5">
                    <div className="flex items-start gap-3.5">
                        <div
                            className={`shrink-0 h-11 w-11 sm:h-12 sm:w-12 rounded-2xl bg-gradient-to-br ${tab.accent} shadow-lg flex items-center justify-center [&>svg]:h-5 [&>svg]:w-5 sm:[&>svg]:h-6 sm:[&>svg]:w-6 text-white`}
                        >
                            {HUB_TAB_ICONS[tab.id]}
                        </div>
                        <div className="min-w-0 flex-1">
                            <h1 className="app-title text-xl sm:text-3xl text-gray-900 dark:text-gray-100 leading-tight">
                                Movie Hub
                            </h1>
                            <p className="mt-0.5 text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                                <span className="font-semibold text-gray-800 dark:text-gray-200">
                                    {tab.label}
                                </span>
                                <span className="hidden sm:inline"> · {tab.blurb}</span>
                                <span className="sm:hidden"> — {tab.blurb}</span>
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </header>
    );
}
