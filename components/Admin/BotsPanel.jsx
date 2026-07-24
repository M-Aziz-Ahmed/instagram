"use client";

import { useState, useEffect, useCallback } from "react";
import { useToast } from "@/context/ToastContext";

const STYLES = [
    { value: "casual", label: "Casual", desc: "Laid-back, conversational" },
    { value: "professional", label: "Professional", desc: "Analytical, data-driven" },
    { value: "funny", label: "Funny", desc: "Memes and humor" },
    { value: "news", label: "News", desc: "Factual, headline-style" },
    { value: "hype", label: "Hype", desc: "High energy, all-caps" },
];

const COLORS = ["#3b82f6","#8b5cf6","#10b981","#f59e0b","#ef4444","#ec4899","#06b6d4","#84cc16"];

export default function BotsPanel() {
    const { showToast: toast } = useToast();
    const [bots, setBots] = useState([]);
    const [topics, setTopics] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);
    const [form, setForm] = useState({
        name: "", username: "", bio: "", style: "casual", topics: [],
        postsPerDay: 1, postTimes: ["09:00"], avatarColor: "#10b981",
        useRealNews: true, includeImages: true,
    });
    const [previewPost, setPreviewPost] = useState(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [previewTopic, setPreviewTopic] = useState("");

    const fetchBots = useCallback(async () => {
        try {
            const r = await fetch("/api/bots");
            if (r.ok) setBots(await r.json());
        } catch {}
        setLoading(false);
    }, []);

    const fetchTopics = useCallback(async () => {
        try {
            const r = await fetch("/api/bots/topics");
            if (r.ok) {
                const data = await r.json();
                setTopics(data);
            }
        } catch {}
    }, []);

    useEffect(() => { fetchBots(); fetchTopics(); }, [fetchBots, fetchTopics]);

    function toggleTopic(topic) {
        setForm((f) => ({
            ...f,
            topics: f.topics.includes(topic) ? f.topics.filter((t) => t !== topic) : [...f.topics, topic],
        }));
    }

    async function handleCreate() {
        if (!form.name || !form.username) return toast("Name and username required", "error");
        if (!form.topics.length) return toast("Select at least one topic", "error");
        try {
            const r = await fetch("/api/bots", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(form),
            });
            const data = await r.json();
            if (!r.ok) return toast(data.error || "Failed", "error");
            toast("Bot created!", "success");
            setShowCreate(false);
            setForm({ name: "", username: "", bio: "", style: "casual", topics: [], postsPerDay: 1, postTimes: ["09:00"], avatarColor: "#10b981", useRealNews: true, includeImages: true });
            fetchBots();
        } catch { toast("Network error", "error"); }
    }

    async function toggleBot(id) {
        try {
            const r = await fetch(`/api/bots/${id}/toggle`, { method: "PATCH" });
            if (r.ok) fetchBots();
        } catch {}
    }

    async function deleteBot(id) {
        if (!confirm("Delete this bot?")) return;
        try {
            const r = await fetch(`/api/bots/${id}`, { method: "DELETE" });
            if (r.ok) { toast("Bot deleted", "success"); fetchBots(); }
        } catch {}
    }

    async function postNow(id) {
        setPreviewLoading(true);
        try {
            const r = await fetch(`/api/bots/${id}/post-now`, { method: "POST" });
            const data = await r.json();
            if (!r.ok) { toast(data.error || "Failed", "error"); setPreviewLoading(false); return; }
            setPreviewPost(data.post);
            toast("Bot posted!", "success");
            fetchBots();
        } catch { toast("Network error", "error"); }
        setPreviewLoading(false);
    }

    async function handlePreview() {
        if (!previewTopic) return toast("Select a topic to preview", "error");
        setPreviewLoading(true);
        setPreviewPost(null);
        try {
            const r = await fetch("/api/bots/preview", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ topic: previewTopic, style: form.style }),
            });
            const data = await r.json();
            if (!r.ok) { toast(data.error || "Failed", "error"); setPreviewLoading(false); return; }
            setPreviewPost({ text: data.text, imageUrl: data.image, sender: "preview", isPreview: true });
        } catch { toast("Network error", "error"); }
        setPreviewLoading(false);
    }

    async function seedDefaults() {
        try {
            const r = await fetch("/api/bots/seed-defaults", { method: "POST" });
            const data = await r.json();
            toast(data.message || "Done", "success");
            fetchBots();
        } catch { toast("Network error", "error"); }
    }

    if (loading) return <div className="py-8 text-center text-gray-400 text-sm">Loading bots...</div>;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Post Bots</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Automated accounts that post real news daily</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={seedDefaults} className="px-3 py-1.5 bg-emerald-500 text-white text-xs font-semibold rounded-lg hover:bg-emerald-600 transition-colors">
                        Seed Defaults
                    </button>
                    <button onClick={() => setShowCreate(!showCreate)} className="px-3 py-1.5 bg-blue-500 text-white text-xs font-semibold rounded-lg hover:bg-blue-600 transition-colors">
                        {showCreate ? "Cancel" : "+ New Bot"}
                    </button>
                </div>
            </div>

            {/* Create form */}
            {showCreate && (
                <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-5 space-y-4 border border-gray-200 dark:border-gray-700">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Bot Name</label>
                            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-sm" placeholder="Tech Daily" />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Username</label>
                            <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") })} className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-sm" placeholder="techdaily" />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Bio</label>
                        <input value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-sm" placeholder="Your daily tech dose 🤖" />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Posting Style</label>
                        <div className="flex flex-wrap gap-2">
                            {STYLES.map((s) => (
                                <button key={s.value} onClick={() => setForm({ ...form, style: s.value })} className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${form.style === s.value ? "bg-blue-500 text-white border-blue-500" : "bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-blue-300"}`}>
                                    {s.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Topics (select multiple)</label>
                        <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto">
                            {topics.map((t) => (
                                <button key={t.name} onClick={() => toggleTopic(t.name)} className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${form.topics.includes(t.name) ? "bg-blue-500 text-white border-blue-500" : "bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-blue-300"}`}>
                                    {t.name} <span className="opacity-50">({t.feedCount})</span>
                                </button>
                            ))}
                        </div>
                        <p className="text-[10px] text-gray-400 mt-1">{form.topics.length} selected — each topic pulls from multiple RSS news feeds</p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Posts/Day</label>
                            <input type="number" min="1" max="10" value={form.postsPerDay} onChange={(e) => setForm({ ...form, postsPerDay: parseInt(e.target.value) || 1 })} className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-sm" />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Post Times (HH:MM)</label>
                            <input value={form.postTimes.join(", ")} onChange={(e) => setForm({ ...form, postTimes: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) })} className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-sm" placeholder="09:00, 14:00" />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Color</label>
                            <div className="flex gap-1.5 mt-1">
                                {COLORS.map((c) => (
                                    <button key={c} onClick={() => setForm({ ...form, avatarColor: c })} className={`w-7 h-7 rounded-full border-2 transition-transform ${form.avatarColor === c ? "border-gray-900 dark:border-white scale-110" : "border-transparent"}`} style={{ backgroundColor: c }} />
                                ))}
                            </div>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={form.useRealNews} onChange={(e) => setForm({ ...form, useRealNews: e.target.checked })} className="w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500" />
                            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Real news from RSS feeds</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={form.includeImages} onChange={(e) => setForm({ ...form, includeImages: e.target.checked })} className="w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500" />
                            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Include images</span>
                        </label>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={handleCreate} className="px-6 py-2 bg-blue-500 text-white text-sm font-semibold rounded-lg hover:bg-blue-600 transition-colors">
                            Create Bot
                        </button>
                    </div>
                </div>
            )}

            {/* Preview section */}
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
                <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-3">Preview a Post</h4>
                <div className="flex items-end gap-2">
                    <div className="flex-1">
                        <label className="block text-[10px] text-gray-500 mb-1">Pick a topic</label>
                        <select value={previewTopic} onChange={(e) => setPreviewTopic(e.target.value)} className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm">
                            <option value="">Select topic...</option>
                            {topics.map((t) => (
                                <option key={t.name} value={t.name}>{t.name} ({t.feedCount} feeds)</option>
                            ))}
                        </select>
                    </div>
                    <button onClick={handlePreview} disabled={previewLoading || !previewTopic} className="px-4 py-2 bg-purple-500 text-white text-sm font-semibold rounded-lg hover:bg-purple-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap">
                        {previewLoading ? "Loading..." : "🔍 Preview"}
                    </button>
                </div>
            </div>

            {/* Preview result */}
            {previewPost && (
                <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-purple-700 dark:text-purple-300">
                            {previewPost.isPreview ? "Post Preview" : "Just Posted"}
                        </span>
                        <button onClick={() => setPreviewPost(null)} className="text-xs text-gray-400 hover:text-gray-600">✕</button>
                    </div>
                    {previewPost.imageUrl && (
                        <img src={previewPost.imageUrl} alt="" className="w-full max-h-64 object-cover rounded-lg mb-3" onError={(e) => { e.target.style.display = "none"; }} />
                    )}
                    <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap">{previewPost.text}</p>
                </div>
            )}

            {/* Bot list */}
            {bots.length === 0 ? (
                <div className="text-center py-12 text-gray-400 text-sm">
                    No bots yet. Click &quot;+ New Bot&quot; or &quot;Seed Defaults&quot; to get started.
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {bots.map((bot) => (
                        <div key={bot._id} className={`rounded-xl border p-4 transition-all ${bot.active ? "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700" : "bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-800 opacity-60"}`}>
                            <div className="flex items-start gap-3">
                                <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0" style={{ backgroundColor: bot.avatarColor }}>
                                    {bot.name[0]}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{bot.name}</span>
                                        <span className="text-[10px] text-gray-400 dark:text-gray-500">@{bot.username}</span>
                                    </div>
                                    <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-1">{bot.bio}</p>
                                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${bot.active ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500"}`}>
                                            {bot.active ? "Active" : "Paused"}
                                        </span>
                                        <span className="text-[10px] text-gray-400">{bot.style}</span>
                                        <span className="text-[10px] text-gray-400">·</span>
                                        {bot.useRealNews !== false && <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">📰 Real News</span>}
                                        {bot.includeImages !== false && <span className="text-[10px] text-blue-500 dark:text-blue-400 font-medium">🖼 Images</span>}
                                        <span className="text-[10px] text-gray-400">·</span>
                                        <span className="text-[10px] text-gray-400">{bot.totalPosts} posts</span>
                                    </div>
                                    <div className="flex flex-wrap gap-1 mt-2">
                                        {bot.topics.slice(0, 4).map((t) => (
                                            <span key={t} className="text-[9px] bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 px-1.5 py-0.5 rounded-full">{t}</span>
                                        ))}
                                        {bot.topics.length > 4 && <span className="text-[9px] text-gray-400">+{bot.topics.length - 4}</span>}
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                                <button onClick={() => toggleBot(bot._id)} className={`flex-1 px-2 py-1.5 text-[11px] font-medium rounded-lg transition-colors ${bot.active ? "bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-900/20 dark:text-amber-400" : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-400"}`}>
                                    {bot.active ? "Pause" : "Activate"}
                                </button>
                                <button onClick={() => postNow(bot._id)} disabled={previewLoading} className="flex-1 px-2 py-1.5 text-[11px] font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400 rounded-lg transition-colors disabled:opacity-50">
                                    {previewLoading ? "Posting..." : "Post Now"}
                                </button>
                                <button onClick={() => deleteBot(bot._id)} className="px-2 py-1.5 text-[11px] font-medium bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 rounded-lg transition-colors">
                                    Delete
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
