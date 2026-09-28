"use client";

/**
 * Admin → Locations: the per-account counterpart to the analytics globe.
 *
 * The globe answers "how much traffic comes from where". This answers "which
 * accounts", which is the question that follows from it and the one a police
 * request is actually about. Both directions live here:
 *
 *   account → place   SubscriberLocationPanel (origin, last seen, frequent places)
 *   place  → account  PlaceLookupPanel (who is in Karachi)
 *
 * Kept as one tab with a shared username so that moving between the two
 * directions keeps the subject you are working on, which is what you want when
 * an investigation moves from a name to a city and back.
 *
 * A permanent banner states that reads are audit-logged, because the honest
 * thing to do with a tool like this is tell the operator it is not covert.
 */

import { useState } from "react";
import SubscriberLocationPanel from "./SubscriberLocationPanel";
import PlaceLookupPanel from "./PlaceLookupPanel";

export default function SubscriberLocationsTab({ initialUsername = "", onUsernameChange }) {
    const [username, setUsername] = useState(initialUsername);

    const update = (v) => {
        setUsername(v);
        onUsernameChange?.(v);
    };

    return (
        <div className="space-y-4">
            <div className="rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-900/10 p-3">
                <p className="text-xs font-bold text-amber-800 dark:text-amber-300">
                    Compliance tool — every read is audit-logged
                </p>
                <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5">
                    Opening a location record, or listing the accounts at a place, writes a
                    system log entry naming you, the subject, and your own IP address. Account
                    origin is kept permanently; connection history expires after the retention
                    window shown in each panel. Handle a disclosure request according to your
                    jurisdiction&apos;s process — this panel is not a substitute for legal process.
                </p>
            </div>

            <div className="grid gap-4 lg:grid-cols-2 items-start">
                {/* account → place */}
                <section className="rounded-xl border border-gray-200 dark:border-gray-800 p-3">
                    <h3 className="text-sm font-bold text-gray-800 dark:text-gray-100 mb-2">
                        Account → location
                    </h3>
                    <div className="mb-3">
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                            Username
                        </label>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => update(e.target.value.trim())}
                            placeholder="username"
                            autoComplete="off"
                            spellCheck={false}
                            className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-base sm:text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 outline-none focus:border-blue-400 dark:focus:border-blue-500 transition-colors"
                        />
                    </div>
                    <SubscriberLocationPanel username={username} />
                </section>

                {/* place → account */}
                <section className="rounded-xl border border-gray-200 dark:border-gray-800 p-3">
                    <h3 className="text-sm font-bold text-gray-800 dark:text-gray-100 mb-2">
                        Place → accounts
                    </h3>
                    <PlaceLookupPanel onSelectUsername={update} />
                </section>
            </div>
        </div>
    );
}
