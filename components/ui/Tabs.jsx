"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * The app had six hand-rolled tab bars, each with slightly different padding,
 * active-state colour and scroll behaviour. This is the single implementation.
 *
 * Two visual variants:
 *   "pill"     – rounded segmented control, used for compact switches
 *                (Sub/Dub, ad type, library filters)
 *   "underline"– full-width bar with a sliding indicator, used for page-level
 *                navigation (the movie hub)
 *
 * The indicator is measured from the DOM and animated with a transform so it
 * tracks the active tab, reflows on resize, and works on a horizontally
 * scrollable row on mobile.
 */
export default function Tabs({
    tabs,
    value,
    onChange,
    variant = "underline",
    className = "",
    label = "Tabs",
    scrollable = variant === "underline",
}) {
    const listRef = useRef(null);
    const [indicator, setIndicator] = useState({ left: 0, width: 0, ready: false });

    const activeIndex = Math.max(
        0,
        tabs.findIndex((t) => t.id === value),
    );

    const measure = useCallback(() => {
        const list = listRef.current;
        if (!list) return;
        const active = list.querySelector('[data-active="true"]');
        if (!active) {
            setIndicator((p) => ({ ...p, ready: false }));
            return;
        }
        setIndicator({
            left: active.offsetLeft,
            width: active.offsetWidth,
            ready: true,
        });
    }, []);

    useLayoutEffect(measure, [measure, value, tabs]);

    useEffect(() => {
        const list = listRef.current;
        if (!list || typeof ResizeObserver === "undefined") {
            window.addEventListener("resize", measure);
            return () => window.removeEventListener("resize", measure);
        }
        const ro = new ResizeObserver(measure);
        ro.observe(list);
        // Fonts landing late change tab widths.
        const fonts = document.fonts;
        fonts?.ready?.then(measure).catch(() => {});
        return () => ro.disconnect();
    }, [measure]);

    // Keep the active tab in view when it changes via keyboard / deep link.
    useEffect(() => {
        if (!scrollable) return;
        const list = listRef.current;
        const active = list?.querySelector('[data-active="true"]');
        if (!list || !active) return;
        const left = active.offsetLeft;
        const right = left + active.offsetWidth;
        if (left < list.scrollLeft || right > list.scrollLeft + list.clientWidth) {
            list.scrollTo({ left: left - 12, behavior: "smooth" });
        }
    }, [value, scrollable]);

    const isPill = variant === "pill";

    return (
        <div
            role="tablist"
            aria-label={label}
            ref={listRef}
            className={
                isPill
                    ? `inline-flex items-center gap-1 rounded-full p-1 app-sunken border border-[var(--border-subtle)] ${className}`
                    : `relative flex border-b border-[var(--border-subtle)] ${
                          scrollable ? "overflow-x-auto scrollbar-hide" : ""
                      } ${className}`
            }
        >
            {!isPill && indicator.ready && (
                <span
                    aria-hidden="true"
                    className="absolute bottom-0 h-[3px] rounded-t-full bg-[var(--brand-500)] transition-[left,width] duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)]"
                    style={{ left: indicator.left, width: indicator.width }}
                />
            )}

            {tabs.map((tab) => {
                const active = tab.id === value;
                return (
                    <button
                        key={tab.id}
                        role="tab"
                        type="button"
                        aria-selected={active}
                        data-active={active}
                        onClick={() => onChange(tab.id)}
                        className={
                            isPill
                                ? `px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${
                                      active
                                          ? "bg-[var(--brand-600)] text-white shadow-sm"
                                          : "text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100"
                                  }`
                                : `group relative flex items-center gap-2 px-4 sm:px-5 h-11 sm:h-12 text-sm font-semibold whitespace-nowrap transition-colors ${
                                      active
                                          ? "text-[var(--brand-600)] dark:text-[var(--brand-300)]"
                                          : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
                                  }`
                        }
                    >
                        {tab.icon ? <span className="text-base leading-none">{tab.icon}</span> : null}
                        {tab.label}
                        {typeof tab.count === "number" && (
                            <span
                                className={`ml-0.5 px-1.5 py-px rounded-full text-[10px] font-bold tabular-nums ${
                                    active
                                        ? "bg-[var(--brand-500)]/15 text-[var(--brand-600)] dark:text-[var(--brand-300)]"
                                        : "bg-gray-200/70 dark:bg-white/10 text-gray-500 dark:text-gray-400"
                                }`}
                            >
                                {tab.count}
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );
}

/**
 * Skeleton grid shown while a tab's content is loading. Without this, every
 * tab switch flashed an empty screen because the child page clears its own
 * state before the first fetch resolves.
 */
export function PanelSkeleton({ variant = "poster", count = 12, className = "" }) {
    if (variant === "rows") {
        return (
            <div className={`space-y-3 ${className}`}>
                {Array.from({ length: count }).map((_, i) => (
                    <div key={i} className="flex gap-3">
                        <div className="skeleton h-16 w-16 rounded-xl shrink-0 skeleton-shimmer" />
                        <div className="flex-1 space-y-2 py-1">
                            <div className="skeleton skeleton-shimmer h-3.5 w-2/3" />
                            <div className="skeleton skeleton-shimmer h-3 w-full" />
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div
            className={`grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3 ${className}`}
        >
            {Array.from({ length: count }).map((_, i) => (
                <div key={i} className="space-y-2">
                    <div className="skeleton skeleton-shimmer w-full aspect-[2/3] rounded-xl" />
                    <div className="skeleton skeleton-shimmer h-3 w-4/5" />
                </div>
            ))}
        </div>
    );
}
