"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "@/context/ToastContext";

// Admin tooling for the gem economy.
//
// There is no payment provider, so this panel *is* the way gems enter the
// economy: an admin issues them, and a user spends them on Pro. The same panel
// can grant Pro directly for staff, testers and compensation, which is the only
// way to grant it today since there is no checkout.
//
// Every action here goes through the server, which is what enforces the
// invariant this panel exists to respect: a balance can never go negative, and
// a deduction larger than the balance is refused rather than clamped.
export default function GemsPanel() {
    const { showToast } = useToast();
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [busy, setBusy] = useState("");

    const [grantUser, setGrantUser] = useState(null);
    const [amount, setAmount] = useState("");
    const [note, setNote] = useState("");

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/admin/users");
            if (res.ok) setUsers(await res.json());
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        refresh();
    }, [refresh]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        const pool = q
            ? users.filter(
                  (u) =>
                      u.username?.toLowerCase().includes(q) ||
                      u.email?.toLowerCase().includes(q),
              )
            : users;
        // Pro users and large balances first: those are the accounts an admin
        // is most likely to be reconciling.
        return [...pool].sort((a, b) => {
            const ap = a.proUntil && new Date(a.proUntil) > new Date() ? 1 : 0;
            const bp = b.proUntil && new Date(b.proUntil) > new Date() ? 1 : 0;
            if (ap !== bp) return bp - ap;
            return (b.gems || 0) - (a.gems || 0);
        });
    }, [users, search]);

    const open = (u) => {
        setGrantUser(u);
        setAmount("");
        setNote("");
    };

    const act = async (path, body, okMessage) => {
        setBusy(path + (body.months ? `:${body.months}` : ""));
        try {
            const res = await fetch(`/api/admin/gems/${path}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                // 402 is the server refusing an overdrawn deduction. Surfaced
                // verbatim because "Not enough gems" is exactly what the admin
                // needs to know, and a generic failure would send them hunting.
                showToast(data.error || "Failed", "error");
                return;
            }

            showToast(okMessage, "success");
            setAmount("");
            setNote("");
            refresh();
        } catch (e) {
            console.error(e);
            showToast("Network error", "error");
        } finally {
            setBusy("");
        }
    };

    const submitAdjust = (sign) => {
        if (!grantUser) return;
        const n = Number(amount);
        if (!Number.isInteger(n) || n === 0) {
            showToast("Enter a whole number", "error");
            return;
        }
        if (sign > 0 && n < 0) return;
        act(
            sign > 0 ? "grant" : "deduct",
            { username: grantUser.username, amount: Math.abs(n), note },
            `${sign > 0 ? "Granted" : "Deducted"} ${Math.abs(n)} gems`,
        );
    };

    return (
        <div className="space-y-5">
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
                <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">
                    Gem economy
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-gray-600 dark:text-gray-400">
                    No payment provider is connected. Gems are issued here and
                    spent by users on Pro, which removes ads. Every movement is
                    written to an append-only ledger. Balances cannot go
                    negative — a deduction over the balance is refused.
                </p>
            </div>

            <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search users…"
                className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-gray-100 outline-none focus:border-blue-500 transition-colors"
            />

            {loading ? (
                <p className="text-sm text-gray-500">Loading…</p>
            ) : (
                <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 dark:bg-gray-800 text-xs text-gray-500">
                            <tr>
                                <th className="px-3 py-2 text-left">User</th>
                                <th className="px-3 py-2 text-right">Gems</th>
                                <th className="px-3 py-2 text-left">Pro</th>
                                <th className="px-3 py-2" />
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((u) => {
                                const proActive =
                                    u.proUntil && new Date(u.proUntil) > new Date();
                                return (
                                    <tr
                                        key={u.id}
                                        className="border-t border-gray-100 dark:border-gray-800"
                                    >
                                        <td className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100">
                                            {u.username}
                                        </td>
                                        <td className="px-3 py-2 text-right tabular-nums text-gray-700 dark:text-gray-300">
                                            {(u.gems || 0).toLocaleString()}
                                        </td>
                                        <td className="px-3 py-2 text-xs">
                                            {proActive ? (
                                                <span className="font-semibold text-amber-600 dark:text-amber-400">
                                                    until{" "}
                                                    {new Date(
                                                        u.proUntil,
                                                    ).toLocaleDateString()}
                                                </span>
                                            ) : u.proUntil ? (
                                                <span className="text-gray-400">
                                                    expired
                                                </span>
                                            ) : (
                                                <span className="text-gray-400">—</span>
                                            )}
                                        </td>
                                        <td className="px-3 py-2 text-right">
                                            <button
                                                onClick={() => open(u)}
                                                className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                                            >
                                                Manage
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                            {filtered.length === 0 && (
                                <tr>
                                    <td
                                        colSpan={4}
                                        className="px-3 py-6 text-center text-gray-400"
                                    >
                                        No users match
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {grantUser && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div
                        className="w-full max-w-md rounded-2xl bg-white dark:bg-gray-900 p-5 space-y-4"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between">
                            <h4 className="text-base font-bold text-gray-900 dark:text-gray-100">
                                {grantUser.username}
                            </h4>
                            <button
                                onClick={() => setGrantUser(null)}
                                className="text-gray-400 hover:text-gray-600"
                                aria-label="Close"
                            >
                                ✕
                            </button>
                        </div>

                        <p className="text-sm text-gray-600 dark:text-gray-400">
                            Balance:{" "}
                            <b className="tabular-nums">
                                {(grantUser.gems || 0).toLocaleString()}
                            </b>{" "}
                            gems
                            {grantUser.proUntil &&
                                new Date(grantUser.proUntil) > new Date() && (
                                    <>
                                        {" · "}
                                        <span className="text-amber-600 dark:text-amber-400">
                                            Pro until{" "}
                                            {new Date(
                                                grantUser.proUntil,
                                            ).toLocaleDateString()}
                                        </span>
                                    </>
                                )}
                        </p>

                        <div>
                            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">
                                Amount
                            </label>
                            <input
                                type="number"
                                min="1"
                                step="1"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                placeholder="e.g. 500"
                                className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-gray-100 outline-none focus:border-blue-500 transition-colors"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">
                                Note (optional, kept in the ledger)
                            </label>
                            <input
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                                placeholder="e.g. launch promo compensation"
                                maxLength={200}
                                className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-gray-100 outline-none focus:border-blue-500 transition-colors"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                            <button
                                onClick={() => submitAdjust(1)}
                                disabled={!!busy}
                                className="py-2.5 text-sm font-semibold rounded-xl bg-emerald-600 text-white disabled:opacity-50 hover:bg-emerald-700 transition-colors"
                            >
                                {busy === "grant" ? "Granting…" : "Grant"}
                            </button>
                            <button
                                onClick={() => submitAdjust(-1)}
                                disabled={!!busy}
                                className="py-2.5 text-sm font-semibold rounded-xl bg-rose-600 text-white disabled:opacity-50 hover:bg-rose-700 transition-colors"
                            >
                                {busy === "deduct" ? "Deducting…" : "Deduct"}
                            </button>
                        </div>

                        <div className="border-t border-gray-100 dark:border-gray-800 pt-3">
                            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">
                                Grant Pro directly (bypasses gems)
                            </p>
                            <div className="flex gap-2">
                                {[1, 3, 12].map((m) => (
                                    <button
                                        key={m}
                                        onClick={() =>
                                            act(
                                                "pro",
                                                {
                                                    username: grantUser.username,
                                                    months: m,
                                                },
                                                `Granted ${m} month${m > 1 ? "s" : ""} of Pro`,
                                            )
                                        }
                                        disabled={!!busy}
                                        className="flex-1 py-2 text-xs font-semibold rounded-xl border border-amber-500/40 text-amber-700 dark:text-amber-400 disabled:opacity-50 hover:bg-amber-500/10 transition-colors"
                                    >
                                        {busy === `pro:${m}`
                                            ? "…"
                                            : `+${m} month${m > 1 ? "s" : ""}`}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
