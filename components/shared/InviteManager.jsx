"use client";

import { useState, useEffect } from "react";
import { useToast } from "@/context/ToastContext";

function CopyIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75" />
        </svg>
    );
}

function PlusIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
    );
}

function TrashIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
        </svg>
    );
}

function CloseIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
        </svg>
    );
}

export default function InviteManager({ isOpen, onClose }) {
    const { showToast } = useToast();
    const [invites, setInvites] = useState([]);
    const [totalInvites, setTotalInvites] = useState(0);
    const [personalCode, setPersonalCode] = useState("");
    const [loading, setLoading] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [maxUses, setMaxUses] = useState(1);
    const [expiresDays, setExpiresDays] = useState("");
    const [copiedCode, setCopiedCode] = useState(null);

    useEffect(() => {
        if (isOpen) fetchInvites();
    }, [isOpen]);

    const fetchInvites = async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/invites");
            if (res.ok) {
                const data = await res.json();
                setInvites(data.invites || []);
                setTotalInvites(data.totalInvites || 0);
                setPersonalCode(data.personalCode || "");
            }
        } catch {}
        setLoading(false);
    };

    const generateInvite = async () => {
        setGenerating(true);
        try {
            const body = { maxUses };
            if (expiresDays) body.expiresInDays = parseInt(expiresDays);
            const res = await fetch("/api/invites", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            if (res.ok) {
                const data = await res.json();
                setInvites((prev) => [data, ...prev]);
                showToast("Invite code created!", "success");
            } else {
                const data = await res.json();
                showToast(data.error || "Failed to create invite", "error");
            }
        } catch {
            showToast("Network error", "error");
        }
        setGenerating(false);
    };

    const revokeInvite = async (code) => {
        try {
            const res = await fetch("/api/invites", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ code }),
            });
            if (res.ok) {
                setInvites((prev) => prev.filter((i) => i.code !== code));
                showToast("Invite revoked", "success");
            }
        } catch {
            showToast("Failed to revoke", "error");
        }
    };

    const copyCode = async (code) => {
        const url = `${typeof window !== "undefined" ? window.location.origin : ""}/invite/${code}`;
        try {
            await navigator.clipboard.writeText(url);
        } catch {
            const ta = document.createElement("textarea");
            ta.value = url;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand("copy");
            document.body.removeChild(ta);
        }
        setCopiedCode(code);
        setTimeout(() => setCopiedCode(null), 2000);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 animate-fade-in" onClick={onClose}>
            <div
                className="bg-white dark:bg-gray-900 rounded-t-3xl sm:rounded-2xl w-full sm:w-[24rem] max-h-[85vh] shadow-2xl border border-gray-200 dark:border-gray-700 animate-slide-up overflow-hidden flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-800">
                    <div>
                        <h2 className="font-semibold text-base text-gray-900 dark:text-gray-100">Invite Friends</h2>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                            {totalInvites > 0 ? `${totalInvites} friends joined` : "Share invite codes with friends"}
                        </p>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-2 -mr-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                        <CloseIcon />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4">
                    {personalCode && (
                        <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
                            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Your personal invite code</p>
                            <div className="flex items-center gap-2">
                                <code className="text-lg font-black text-gray-900 dark:text-gray-100 tracking-wider">{personalCode}</code>
                            </div>
                        </div>
                    )}

                    <div className="mb-4">
                        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Generate new code</p>
                        <div className="flex gap-2 items-end">
                            <div className="flex-1">
                                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Max uses</label>
                                <select
                                    value={maxUses}
                                    onChange={(e) => setMaxUses(parseInt(e.target.value))}
                                    className="w-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 rounded-xl px-3 py-2 outline-none focus:border-gray-400 dark:focus:border-gray-500"
                                >
                                    <option value={1}>1 use</option>
                                    <option value={5}>5 uses</option>
                                    <option value={10}>10 uses</option>
                                    <option value={25}>25 uses</option>
                                    <option value={50}>50 uses</option>
                                    <option value={100}>100 uses</option>
                                </select>
                            </div>
                            <div className="flex-1">
                                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Expires</label>
                                <select
                                    value={expiresDays}
                                    onChange={(e) => setExpiresDays(e.target.value)}
                                    className="w-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 rounded-xl px-3 py-2 outline-none focus:border-gray-400 dark:focus:border-gray-500"
                                >
                                    <option value="">Never</option>
                                    <option value="1">1 day</option>
                                    <option value="7">7 days</option>
                                    <option value="30">30 days</option>
                                    <option value="90">90 days</option>
                                </select>
                            </div>
                            <button
                                onClick={generateInvite}
                                disabled={generating}
                                className="flex items-center gap-1.5 px-4 py-2 bg-blue-500 text-white text-sm font-medium rounded-xl hover:bg-blue-600 transition-colors disabled:opacity-50 shrink-0"
                            >
                                {generating ? (
                                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                ) : (
                                    <PlusIcon />
                                )}
                                Create
                            </button>
                        </div>
                    </div>

                    <div>
                        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                            Active codes ({invites.length})
                        </p>
                        {loading ? (
                            <div className="flex justify-center py-8">
                                <div className="w-5 h-5 border-2 border-gray-300 dark:border-gray-700 border-t-gray-600 dark:border-t-gray-400 rounded-full animate-spin" />
                            </div>
                        ) : invites.length === 0 ? (
                            <div className="text-center py-8">
                                <p className="text-sm text-gray-400 dark:text-gray-500">No invite codes yet</p>
                                <p className="text-xs text-gray-300 dark:text-gray-600 mt-1">Generate one above to share with friends</p>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-2">
                                {invites.map((inv) => (
                                    <div key={inv.code} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
                                        <div className="flex-1 min-w-0">
                                            <code className="text-sm font-bold text-gray-900 dark:text-gray-100">{inv.code}</code>
                                            <div className="flex items-center gap-2 mt-0.5">
                                                <span className="text-[11px] text-gray-400 dark:text-gray-500">
                                                    {inv.useCount}/{inv.maxUses} used
                                                </span>
                                                {inv.expiresAt && (
                                                    <span className="text-[11px] text-orange-400">
                                                        exp {new Date(inv.expiresAt).toLocaleDateString()}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => copyCode(inv.code)}
                                            className="p-2 text-gray-400 hover:text-blue-500 transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                                            title="Copy invite link"
                                        >
                                            {copiedCode === inv.code ? (
                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 text-green-500">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                                                </svg>
                                            ) : (
                                                <CopyIcon />
                                            )}
                                        </button>
                                        <button
                                            onClick={() => revokeInvite(inv.code)}
                                            className="p-2 text-gray-400 hover:text-red-500 transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                                            title="Revoke"
                                        >
                                            <TrashIcon />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
