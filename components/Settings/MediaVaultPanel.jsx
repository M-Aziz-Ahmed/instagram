"use client";

/**
 * "Your media, your storage" — settings panel for the media vault.
 *
 * The framing here is deliberate and, more importantly, TRUE: this panel tells
 * the user their photos and videos live in an account they control, that the
 * site stores only a reference, and that they are the one who decides where it
 * goes. Every claim in the copy is a property the implementation actually has,
 * which is what makes it worth saying.
 *
 * What is deliberately NOT said: anything about what this saves us. The user
 * does not need our storage bill, and a feature explained in those terms reads
 * as a limitation being dressed up. The privacy and ownership case stands on
 * its own.
 *
 * A connection holds a cloud name and an unsigned upload preset. Neither is a
 * credential — a preset can only append a file, and cannot read or delete
 * anything already there — so there is no password to ask for and nothing
 * sensitive to store. The setup steps are shown inline because the two values
 * live in the user's own Cloudinary console.
 */

import { useCallback, useEffect, useState } from "react";
import { useUser } from "@/context/UserContext";

function gb(bytes) {
    if (!Number.isFinite(bytes)) return "—";
    if (bytes <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
    return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/** A metered bar. Shows `used / quota` because that is the actual question. */
function UsageBar({ usedBytes, quotaBytes }) {
    const unlimited = !quotaBytes;
    const pct = unlimited ? 0 : Math.min(100, (usedBytes / quotaBytes) * 100);
    const near = !unlimited && pct > 85;
    return (
        <div>
            <div className="flex items-baseline justify-between text-xs mb-1">
                <span className="text-gray-600 dark:text-gray-300 font-medium">
                    {gb(usedBytes)}
                    {unlimited ? " stored in your own storage" : ` of ${gb(quotaBytes)} used`}
                </span>
                <span className="text-gray-400 dark:text-gray-500">
                    {unlimited ? "no limit" : `${Math.round(pct)}%`}
                </span>
            </div>
            <div className="h-2 rounded-full bg-gray-200 dark:bg-gray-800 overflow-hidden">
                <div
                    className={`h-full rounded-full transition-all ${near ? "bg-amber-500" : "bg-emerald-500"}`}
                    style={{ width: `${unlimited ? 100 : Math.max(2, pct)}%` }}
                />
            </div>
        </div>
    );
}

export default function MediaVaultPanel({ className = "" }) {
    const { user } = useUser();
    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [cloudName, setCloudName] = useState("");
    const [preset, setPreset] = useState("");
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    const load = useCallback(async () => {
        try {
            const res = await fetch("/api/media-vault/status", { credentials: "include" });
            if (!res.ok) throw new Error("Could not read your storage settings");
            setStatus(await res.json());
            setError("");
        } catch (err) {
            setError(err.message || "Could not read your storage settings");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!user?.username) return;
        (async () => { await load(); })();
    }, [load, user?.username]);

    const connect = async () => {
        setSaving(true);
        setError("");
        try {
            const res = await fetch("/api/media-vault/cloudinary", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ cloudName, uploadPreset: preset }),
            });
            const body = await res.json();
            if (!res.ok) throw new Error(body.error || "Could not connect that cloud");
            setCloudName("");
            setPreset("");
            setSaved(true);
            setTimeout(() => setSaved(false), 2500);
            await load();
        } catch (err) {
            setError(err.message || "Could not connect that cloud");
        } finally {
            setSaving(false);
        }
    };

    const disconnect = async () => {
        setSaving(true);
        setError("");
        try {
            await fetch("/api/media-vault/cloudinary", { method: "DELETE", credentials: "include" });
            await load();
        } catch (err) {
            setError(err.message || "Could not disconnect");
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div className={`text-xs text-gray-400 py-3 ${className}`}>Loading…</div>;
    if (error && !status) return <div className={`text-xs text-red-500 py-3 ${className}`} role="alert">{error}</div>;
    if (!status) return null;

    const connected = status.tier === "user";

    return (
        <div className={`space-y-3 ${className}`}>
            <div>
                <h3 className="text-sm font-bold text-gray-800 dark:text-gray-100">Your media storage</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {connected
                        ? "Your uploads go to a storage account you control. This site keeps only a reference to each file, so your media stays yours and leaves with you."
                        : "Uploads currently go to this site's storage. Connect your own storage to keep your media in an account you control."}
                </p>
            </div>

            {connected && status.cloud && (
                <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-900/10 p-3 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                            <p className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
                                Connected · {status.cloud.cloudName}
                            </p>
                            <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
                                Uploads are delivered by your own provider.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={disconnect}
                            disabled={saving}
                            className="text-[11px] px-2 py-1 rounded bg-white/70 dark:bg-black/20 hover:bg-white dark:hover:bg-black/30 disabled:opacity-50 shrink-0"
                        >
                            Disconnect
                        </button>
                    </div>
                    <UsageBar usedBytes={status.quota.usedBytes} quotaBytes={0} />
                </div>
            )}

            {!connected && status.canUpload && (
                <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-3 space-y-3">
                    <UsageBar usedBytes={status.quota.usedBytes} quotaBytes={status.quota.quotaBytes} />
                    <p className="text-[11px] text-gray-400">
                        Up to {gb(status.maxFileBytes)} per file.
                    </p>
                </div>
            )}

            {!connected && !status.canUpload && (
                <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-3">
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                        You can still post any video by pasting a link — it plays in the feed and in
                        Reels, and nothing is uploaded here.
                    </p>
                </div>
            )}

            {!connected && (
                <details className="rounded-xl border border-gray-200 dark:border-gray-800 p-3">
                    <summary className="text-xs font-bold text-gray-700 dark:text-gray-200 cursor-pointer select-none">
                        Use my own storage
                    </summary>
                    <div className="mt-3 space-y-3">
                        <ol className="text-[11px] text-gray-500 dark:text-gray-400 space-y-1 list-decimal list-inside">
                            <li>Create a free Cloudinary account.</li>
                            <li>
                                In its console, add an <strong>unsigned</strong> upload preset named{" "}
                                <code className="font-mono">anonfeed</code>, and set a file-size limit.
                            </li>
                            <li>Copy your cloud name and the preset name below.</li>
                        </ol>
                        <div>
                            <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">
                                Cloud name
                            </label>
                            <input
                                type="text"
                                value={cloudName}
                                onChange={(e) => setCloudName(e.target.value.trim())}
                                placeholder="my-cloud-name"
                                autoComplete="off"
                                spellCheck={false}
                                className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-2 text-base sm:text-sm font-mono text-gray-900 dark:text-gray-100 placeholder-gray-400 outline-none focus:border-blue-400 transition-colors"
                            />
                        </div>
                        <div>
                            <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">
                                Unsigned upload preset
                            </label>
                            <input
                                type="text"
                                value={preset}
                                onChange={(e) => setPreset(e.target.value.trim())}
                                placeholder="anonfeed"
                                autoComplete="off"
                                spellCheck={false}
                                className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-2 text-base sm:text-sm font-mono text-gray-900 dark:text-gray-100 placeholder-gray-400 outline-none focus:border-blue-400 transition-colors"
                            />
                        </div>
                        <p className="text-[11px] text-gray-400">
                            These are not passwords. An unsigned preset can only add files to your
                            cloud — it cannot read, change or delete anything already there, and we
                            never ask for your API secret.
                        </p>
                        {error && <p className="text-[11px] text-red-500" role="alert">{error}</p>}
                        <button
                            type="button"
                            onClick={connect}
                            disabled={!cloudName || !preset || saving}
                            className="w-full min-h-[44px] px-4 py-2.5 bg-black dark:bg-gray-100 text-white dark:text-gray-900 font-semibold rounded-xl hover:bg-gray-800 dark:hover:bg-gray-200 disabled:opacity-40 transition-colors"
                        >
                            {saving ? "Connecting…" : saved ? "Connected" : "Connect my storage"}
                        </button>
                    </div>
                </details>
            )}

            {error && connected && <p className="text-[11px] text-red-500" role="alert">{error}</p>}
        </div>
    );
}
