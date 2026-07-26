"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const PRESET_COLORS = ["#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4", "#f97316"];

export default function CreateCommunityClient() {
    const router = useRouter();
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [color, setColor] = useState("#3b82f6");
    const [isPublic, setIsPublic] = useState(true);
    const [rules, setRules] = useState([{ title: "", description: "" }]);
    const [flairs, setFlairs] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const addRule = () => setRules([...rules, { title: "", description: "" }]);
    const removeRule = (i) => setRules(rules.filter((_, idx) => idx !== i));
    const updateRule = (i, field, val) => setRules(rules.map((r, idx) => idx === i ? { ...r, [field]: val } : r));

    const addFlair = () => {
        const colors = ["#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#8b5cf6", "#ec4899"];
        setFlairs([...flairs, { name: "", color: colors[flairs.length % colors.length], emoji: "" }]);
    };
    const removeFlair = (i) => setFlairs(flairs.filter((_, idx) => idx !== i));
    const updateFlair = (i, field, val) => setFlairs(flairs.map((f, idx) => idx === i ? { ...f, [field]: val } : f));

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!name.trim()) return setError("Name is required");
        setLoading(true);
        setError("");

        try {
            const body = {
                name: name.trim(),
                description: description.trim(),
                color,
                isPublic,
                rules: rules.filter((r) => r.title.trim()),
                flairs: flairs.filter((f) => f.name.trim()),
            };
            const res = await fetch("/api/communities", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify(body),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to create");
            router.push(`/communities/${data._id}`);
        } catch (err) {
            setError(err.message);
            setLoading(false);
        }
    };

    return (
        <div className="max-w-lg mx-auto px-4 py-6">
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-6">Create Community</h1>

            <form onSubmit={handleSubmit} className="space-y-5">
                {/* Basic info */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Name *</label>
                    <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="r/mycommunity"
                        maxLength={100}
                        className="w-full px-4 py-2.5 bg-gray-100 dark:bg-gray-800 border-0 rounded-xl text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Description</label>
                    <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="What's this community about?"
                        maxLength={500}
                        rows={3}
                        className="w-full px-4 py-2.5 bg-gray-100 dark:bg-gray-800 border-0 rounded-xl text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                    />
                    <p className="text-xs text-gray-400 mt-1">{description.length}/500</p>
                </div>

                {/* Color */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Color</label>
                    <div className="flex gap-2 flex-wrap">
                        {PRESET_COLORS.map((c) => (
                            <button
                                key={c}
                                type="button"
                                onClick={() => setColor(c)}
                                className={`w-8 h-8 rounded-full transition-all ${color === c ? "ring-2 ring-offset-2 ring-gray-400 scale-110" : "hover:scale-105"}`}
                                style={{ backgroundColor: c }}
                            />
                        ))}
                    </div>
                </div>

                {/* Public toggle */}
                <div className="flex items-center gap-3">
                    <button type="button" onClick={() => setIsPublic(!isPublic)} className={`relative w-10 h-5 rounded-full transition-colors ${isPublic ? "bg-blue-600" : "bg-gray-300 dark:bg-gray-600"}`}>
                        <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${isPublic ? "translate-x-5" : ""}`} />
                    </button>
                    <span className="text-sm text-gray-700 dark:text-gray-300">Public community</span>
                </div>

                {/* Rules */}
                <div>
                    <div className="flex items-center justify-between mb-2">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Rules</label>
                        <button type="button" onClick={addRule} className="text-xs text-blue-500 hover:text-blue-600">+ Add</button>
                    </div>
                    <div className="space-y-2">
                        {rules.map((rule, i) => (
                            <div key={i} className="flex gap-2">
                                <span className="text-xs text-gray-400 mt-2.5 shrink-0">{i + 1}.</span>
                                <div className="flex-1 space-y-1">
                                    <input
                                        type="text"
                                        value={rule.title}
                                        onChange={(e) => updateRule(i, "title", e.target.value)}
                                        placeholder="Rule title"
                                        className="w-full px-3 py-1.5 bg-gray-100 dark:bg-gray-800 rounded-lg text-xs text-gray-900 dark:text-gray-100 placeholder-gray-400 outline-none"
                                    />
                                    <input
                                        type="text"
                                        value={rule.description}
                                        onChange={(e) => updateRule(i, "description", e.target.value)}
                                        placeholder="Optional description"
                                        className="w-full px-3 py-1.5 bg-gray-100 dark:bg-gray-800 rounded-lg text-xs text-gray-900 dark:text-gray-100 placeholder-gray-400 outline-none"
                                    />
                                </div>
                                {rules.length > 1 && (
                                    <button type="button" onClick={() => removeRule(i)} className="text-gray-400 hover:text-red-500 text-xs mt-2">✕</button>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Flairs */}
                <div>
                    <div className="flex items-center justify-between mb-2">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Flairs</label>
                        <button type="button" onClick={addFlair} className="text-xs text-blue-500 hover:text-blue-600">+ Add</button>
                    </div>
                    {flairs.length === 0 && (
                        <p className="text-xs text-gray-400">Add flairs so users can tag their posts</p>
                    )}
                    <div className="space-y-2">
                        {flairs.map((flair, i) => (
                            <div key={i} className="flex gap-2 items-center">
                                <input
                                    type="text"
                                    value={flair.emoji}
                                    onChange={(e) => updateFlair(i, "emoji", e.target.value)}
                                    placeholder="🏷️"
                                    maxLength={2}
                                    className="w-10 px-1 py-1.5 bg-gray-100 dark:bg-gray-800 rounded-lg text-xs text-center text-gray-900 dark:text-gray-100 outline-none"
                                />
                                <input
                                    type="text"
                                    value={flair.name}
                                    onChange={(e) => updateFlair(i, "name", e.target.value)}
                                    placeholder="Flair name"
                                    maxLength={30}
                                    className="flex-1 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 rounded-lg text-xs text-gray-900 dark:text-gray-100 placeholder-gray-400 outline-none"
                                />
                                <input
                                    type="color"
                                    value={flair.color}
                                    onChange={(e) => updateFlair(i, "color", e.target.value)}
                                    className="w-7 h-7 rounded cursor-pointer border-0"
                                />
                                <button type="button" onClick={() => removeFlair(i)} className="text-gray-400 hover:text-red-500 text-xs">✕</button>
                            </div>
                        ))}
                    </div>
                </div>

                {error && <p className="text-sm text-red-500">{error}</p>}

                <div className="flex gap-3 pt-2">
                    <button type="button" onClick={() => router.back()} className="flex-1 py-2.5 text-sm font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                        Cancel
                    </button>
                    <button type="submit" disabled={loading || !name.trim()} className="flex-1 py-2.5 text-sm font-medium bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors">
                        {loading ? "Creating..." : "Create"}
                    </button>
                </div>
            </form>
        </div>
    );
}
