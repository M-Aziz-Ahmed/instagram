"use client";

import { useState } from "react";

export default function InviteModal({ community, onClose }) {
    const [inviteCode, setInviteCode] = useState(community.inviteCode);
    const [copied, setCopied] = useState(false);
    const [regenerating, setRegenerating] = useState(false);

    const inviteLink = typeof window !== "undefined" ? `${window.location.origin}/communities/join/${inviteCode}` : "";

    const copyLink = () => {
        navigator.clipboard.writeText(inviteLink);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const regenerate = async () => {
        setRegenerating(true);
        try {
            const res = await fetch(`/api/communities/${community._id}/invite`, { method: "POST", credentials: "include" });
            const data = await res.json();
            if (res.ok) setInviteCode(data.inviteCode);
        } catch (e) {
            console.error(e);
        } finally {
            setRegenerating(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50" onClick={onClose} />
            <div className="relative bg-white dark:bg-gray-900 rounded-2xl p-5 w-full max-w-sm shadow-xl">
                <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-1">Invite People</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">Share this link to invite people to {community.name}</p>

                <div className="flex gap-2 mb-3">
                    <input
                        type="text"
                        readOnly
                        value={inviteLink}
                        className="flex-1 px-3 py-2 bg-gray-100 dark:bg-gray-800 rounded-lg text-xs text-gray-700 dark:text-gray-300 font-mono truncate"
                    />
                    <button onClick={copyLink} className="px-3 py-2 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap">
                        {copied ? "Copied!" : "Copy"}
                    </button>
                </div>

                <div className="flex gap-2">
                    <button onClick={onClose} className="flex-1 py-2 text-sm font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                        Done
                    </button>
                    <button onClick={regenerate} disabled={regenerating} className="flex-1 py-2 text-sm font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-xl transition-colors disabled:opacity-50">
                        {regenerating ? "Generating..." : "New Code"}
                    </button>
                </div>
            </div>
        </div>
    );
}
