"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// The user's gem wallet and Pro subscription.
//
// There is no payment provider. A subscription is bought with gems, which an
// admin issues or which the user earns in-app. This page is therefore the whole
// checkout: it quotes a price from the server, spends the balance, and reports
// the new expiry. Prices are never computed here - the catalogue comes from
// /api/gems so what the user is shown is exactly what the server charges.
export default function WalletClient() {
    const router = useRouter();
    const [wallet, setWallet] = useState(null);
    const [loading, setLoading] = useState(true);
    const [buying, setBuying] = useState("");
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");

    const load = useCallback(async () => {
        try {
            const res = await fetch("/api/gems", { cache: "no-store" });
            if (res.status === 401) {
                router.push("/login");
                return;
            }
            if (res.ok) setWallet(await res.json());
        } catch {
            setError("Could not load your wallet.");
        } finally {
            setLoading(false);
        }
    }, [router]);

    useEffect(() => {
        load();
    }, [load]);

    const buy = async (sku) => {
        setBuying(sku);
        setError("");
        setNotice("");
        try {
            const res = await fetch("/api/gems/pro", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sku }),
            });
            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                // 402 carries the price so a user who is short sees the number
                // they need, not just a refusal.
                setError(
                    res.status === 402 && data.required
                        ? `You need ${data.required.toLocaleString()} gems for that. You have ${(wallet?.gems || 0).toLocaleString()}.`
                        : data.error || "Purchase failed",
                );
                return;
            }

            setNotice("Pro activated. Thanks for supporting the app!");
            await load();
        } catch {
            setError("Network error");
        } finally {
            setBuying("");
        }
    };

    if (loading) {
        return (
            <div className="min-h-dvh app-bg flex items-center justify-center text-sm text-gray-500">
                Loading your wallet…
            </div>
        );
    }

    if (!wallet) {
        return (
            <div className="min-h-dvh app-bg flex items-center justify-center px-4 text-sm text-gray-500">
                {error || "Wallet unavailable."}
            </div>
        );
    }

    const skus = Object.entries(wallet.catalog || {});

    return (
        <div className="min-h-dvh app-bg pb-16">
            <header className="sticky top-0 z-10 app-bg/90 backdrop-blur border-b border-[var(--border-subtle)]">
                <div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-3">
                    <button
                        onClick={() => router.back()}
                        aria-label="Back"
                        className="p-1 -ml-1 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                        </svg>
                    </button>
                    <h1 className="text-base font-bold text-gray-900 dark:text-gray-100">
                        Wallet &amp; Pro
                    </h1>
                </div>
            </header>

            <main className="max-w-2xl mx-auto px-4 py-5 space-y-5">
                {/* Balance */}
                <section className="rounded-2xl p-5 bg-gradient-to-br from-amber-400 to-amber-600 text-white">
                    <p className="text-xs font-semibold uppercase tracking-wide opacity-90">
                        Balance
                    </p>
                    <p className="mt-1 text-3xl font-black tabular-nums">
                        {(wallet.gems || 0).toLocaleString()}
                        <span className="ml-1.5 text-sm font-bold opacity-90">
                            gems
                        </span>
                    </p>
                    {wallet.isPro ? (
                        <p className="mt-2 text-xs font-semibold">
                            Pro active until{" "}
                            {new Date(wallet.proUntil).toLocaleDateString()}
                        </p>
                    ) : (
                        <p className="mt-2 text-xs opacity-90">Not subscribed</p>
                    )}
                </section>

                {notice && (
                    <p className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 px-4 py-3 text-sm font-medium text-emerald-700 dark:text-emerald-400">
                        {notice}
                    </p>
                )}
                {error && (
                    <p className="rounded-xl bg-rose-500/10 border border-rose-500/30 px-4 py-3 text-sm font-medium text-rose-700 dark:text-rose-400">
                        {error}
                    </p>
                )}

                {/* What Pro gives you */}
                <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-5">
                    <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">
                        What Pro includes
                    </h2>
                    <ul className="mt-2.5 space-y-1.5">
                        {(wallet.perks || []).map((perk) => (
                            <li
                                key={perk.id}
                                className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400"
                            >
                                <span className="mt-0.5 text-emerald-500">✓</span>
                                {perk.label}
                            </li>
                        ))}
                    </ul>
                </section>

                {/* Plans */}
                <section className="space-y-2">
                    <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">
                        {wallet.isPro ? "Extend Pro" : "Get Pro"}
                    </h2>
                    {skus.map(([sku, item]) => {
                        const afford = (wallet.gems || 0) >= item.gems;
                        return (
                            <button
                                key={sku}
                                onClick={() => buy(sku)}
                                disabled={!!buying}
                                className="w-full flex items-center justify-between gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-4 py-3.5 text-left transition-colors hover:border-amber-500 disabled:opacity-60 disabled:hover:border-[var(--border-subtle)]"
                            >
                                <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                                    {item.label}
                                </span>
                                <span className="flex items-center gap-2">
                                    <span
                                        className={`text-sm font-bold tabular-nums ${afford ? "text-amber-600 dark:text-amber-400" : "text-gray-400"}`}
                                    >
                                        {item.gems.toLocaleString()} gems
                                    </span>
                                    {buying === sku && (
                                        <span className="text-xs text-gray-400">
                                            …
                                        </span>
                                    )}
                                </span>
                            </button>
                        );
                    })}
                    <p className="text-[11px] leading-relaxed text-gray-500 dark:text-gray-400 pt-1">
                        No card is charged and no payment provider is connected.
                        Gems come from admins and in-app rewards, and every
                        movement is recorded in a ledger.
                    </p>
                </section>

                {/* History */}
                {wallet.history?.length > 0 && (
                    <section>
                        <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-2">
                            Recent activity
                        </h2>
                        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] divide-y divide-[var(--border-subtle)]">
                            {wallet.history.map((h, i) => (
                                <div
                                    key={h._id || i}
                                    className="flex items-center justify-between gap-3 px-4 py-3"
                                >
                                    <div className="min-w-0">
                                        <p className="text-sm font-medium text-gray-800 dark:text-gray-200 capitalize">
                                            {h.reason?.replace(/_/g, " ")}
                                        </p>
                                        <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                                            {h.note || new Date(h.createdAt).toLocaleString()}
                                        </p>
                                    </div>
                                    <span
                                        className={`shrink-0 text-sm font-bold tabular-nums ${h.amount > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-gray-600 dark:text-gray-400"}`}
                                    >
                                        {h.amount > 0 ? "+" : ""}
                                        {h.amount.toLocaleString()}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </section>
                )}
            </main>
        </div>
    );
}
