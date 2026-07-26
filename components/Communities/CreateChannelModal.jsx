"use client";

import { useState } from "react";

export default function CreateChannelModal({ communityId, onClose }) {
    const [name, setName] = useState("");
    const [type, setType] = useState("text");
    const [description, setDescription] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const create = async (e) => {
        e.preventDefault();
        if (!name.trim()) return setError("Name required");
        setLoading(true);
        setError("");

        try {
            const res = await fetch(`/api/communities/${communityId}/channels`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ name: name.trim(), type, description: description.trim() }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed");
            onClose();
        } catch (err) {
            setError(err.message);
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50" onClick={onClose} />
            <div className="relative bg-white dark:bg-gray-900 rounded-2xl p-5 w-full max-w-sm shadow-xl">
                <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">Create Channel</h2>
                <form onSubmit={create} className="space-y-3">
                    <div className="flex gap-2">
                        {["text", "voice"].map((t) => (
                            <button key={t} type="button" onClick={() => setType(t)} className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors capitalize ${type === t ? "bg-blue-600 text-white" : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"}`}>
                                {t}
                            </button>
                        ))}
                    </div>
                    <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Channel name"
                        className="w-full px-4 py-2.5 bg-gray-100 dark:bg-gray-800 border-0 rounded-xl text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 outline-none"
                        autoFocus
                    />
                    <input
                        type="text"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Description (optional)"
                        className="w-full px-4 py-2.5 bg-gray-100 dark:bg-gray-800 border-0 rounded-xl text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                    {error && <p className="text-xs text-red-500">{error}</p>}
                    <div className="flex gap-2 pt-1">
                        <button type="button" onClick={onClose} className="flex-1 py-2 text-sm font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                            Cancel
                        </button>
                        <button type="submit" disabled={loading || !name.trim()} className="flex-1 py-2 text-sm font-medium bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors">
                            {loading ? "Creating..." : "Create"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
