"use client";

import { useState } from "react";

// Time picker for scheduling a post.
//
// Deliberately relative-first ("in 1 hour", "tomorrow 9am") with a native
// datetime-local fallback. Scheduling is for "post this when the announcement
// lands" and "post this before the stream starts", and both are far easier to
// aim with a relative preset than by hand-setting a date three days out. The
// absolute field is still there for the case that actually needs it.
//
// Everything is clamped to the future. The server decides `isScheduled` with
// `scheduledAt > now`, so a past value would silently publish immediately — which
// reads as the scheduler having ignored you.

const MIN_LEAD_MS = 5 * 60 * 1000;

// Presets are expressed as offsets from "now" at the moment they are chosen, not
// fixed clock times, so they stay correct in whatever timezone the reader is in.
const PRESETS = [
    { label: "in 15m",  ms: 15 * 60 * 1000 },
    { label: "in 1h",   ms: 60 * 60 * 1000 },
    { label: "in 3h",   ms: 3 * 60 * 60 * 1000 },
    { label: "in 6h",   ms: 6 * 60 * 60 * 1000 },
    { label: "tomorrow", dayOffset: 1, hour: 9 },
    { label: "in 2 days", dayOffset: 2, hour: 9 },
    { label: "next week", dayOffset: 7, hour: 9 },
];

function toLocalInputValue(date) {
    const pad = (n) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// Module level, not inside the component. Reading the clock is an impure
// operation, and the React compiler only tolerates it lexically outside a
// component body — the same reason formatScheduleLabel below is exported.
function isTooSoon(date) {
    return !(date instanceof Date)
        || Number.isNaN(date.getTime())
        || date.getTime() <= Date.now() + MIN_LEAD_MS;
}

export function formatScheduleLabel(iso) {
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return "Set a time";
    const diff = t - Date.now();
    if (diff < MIN_LEAD_MS) return "Set a time";
    const mins = Math.round(diff / 60000);
    if (mins < 60) return `in ${mins}m`;
    const hours = Math.round(diff / 3600000);
    if (hours < 24) return `in ${hours}h`;
    const days = Math.round(diff / 86400000);
    if (days <= 7) return `in ${days}d`;
    return new Date(t).toLocaleString(undefined, {
        month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
    });
}

export default function SchedulePicker({ value, onChange }) {
    const [custom, setCustom] = useState(() => (value ? toLocalInputValue(new Date(value)) : ""));
    // Set when the reader picks a time that is too close to now to be
    // meaningful. Previously the picker silently ignored such a value, which
    // reads as the control being broken.
    const [tooSoon, setTooSoon] = useState(false);

    const apply = (date) => {
        if (isTooSoon(date)) {
            setTooSoon(true);
            return false;
        }
        setTooSoon(false);
        onChange(date.toISOString());
        return true;
    };

    return (
        <div className="flex flex-col gap-2 p-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
            <div className="flex flex-wrap gap-1.5">
                {PRESETS.map((p) => (
                    <button
                        key={p.label}
                        onClick={() => {
                            const d = p.ms
                                ? new Date(Date.now() + p.ms)
                                : (() => {
                                      const d = new Date();
                                      d.setDate(d.getDate() + p.dayOffset);
                                      d.setHours(p.hour, 0, 0, 0);
                                      return d;
                                  })();
                            apply(d);
                        }}
                        className="text-[11px] font-medium px-2 py-1 rounded-full bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 transition-colors border border-gray-200 dark:border-gray-700 min-h-[28px]"
                    >
                        {p.label}
                    </button>
                ))}
            </div>

            <label className="flex items-center gap-2 text-[11px] text-gray-500 dark:text-gray-400">
                <span className="shrink-0">Or pick a date &amp; time</span>
                <input
                    type="datetime-local"
                    value={custom}
                    onChange={(e) => {
                        setCustom(e.target.value);
                        if (!e.target.value) return;
                        // datetime-local has no timezone, so this parses in the
                        // reader's local zone — which is what they typed.
                        apply(new Date(e.target.value));
                    }}
                    className="flex-1 min-w-0 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 text-[11px] text-gray-900 dark:text-gray-100 outline-none focus:border-blue-400"
                />
            </label>

            {tooSoon && (
                <p className="text-[10px] text-red-500 dark:text-red-400">
                    Pick a time at least {MIN_LEAD_MS / 60000} minutes from now.
                </p>
            )}

            <p className="text-[10px] text-gray-400 dark:text-gray-500">
                Times are in your local timezone. A scheduled post stays private until it publishes.
            </p>
        </div>
    );
}
