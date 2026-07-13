"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export default function MentionInput({
    value,
    onChange,
    onSubmit,
    placeholder,
    maxLength = 300,
    className = "",
    submitLabel = "Post",
    submitting = false,
}) {
    const [query, setQuery]         = useState(null);
    const [results, setResults]     = useState([]);
    const [highlight, setHighlight] = useState(0);
    const [showDropdown, setShowDropdown] = useState(false);
    const inputRef = useRef(null);
    const dropdownRef = useRef(null);

    const fetchUsers = useCallback(async (q) => {
        if (!q) { setResults([]); return; }
        try {
            const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
            if (res.ok) {
                const data = await res.json();
                setResults(data.users || []);
            }
        } catch { /* silent */ }
    }, []);

    useEffect(() => {
        if (query === null) return;
        const t = setTimeout(() => fetchUsers(query), 200);
        return () => clearTimeout(t);
    }, [query, fetchUsers]);

    useEffect(() => {
        setHighlight(0);
    }, [results]);

    const handleChange = (e) => {
        const val = e.target.value;
        onChange(val);

        const pos = e.target.selectionStart;
        const before = val.slice(0, pos);
        const match = before.match(/@([a-zA-Z0-9_]*)$/);
        if (match) {
            setQuery(match[1]);
            setShowDropdown(true);
        } else {
            setShowDropdown(false);
            setQuery(null);
        }
    };

    const insertMention = (username) => {
        const pos = inputRef.current?.selectionStart ?? value.length;
        const before = value.slice(0, pos);
        const after = value.slice(pos);
        const atIdx = before.lastIndexOf("@");
        const newText = before.slice(0, atIdx) + `@${username} ` + after;
        onChange(newText);
        setShowDropdown(false);
        setQuery(null);
        setTimeout(() => {
            const newPos = atIdx + username.length + 2;
            inputRef.current?.setSelectionRange(newPos, newPos);
            inputRef.current?.focus();
        }, 0);
    };

    const handleKeyDown = (e) => {
        if (!showDropdown || results.length === 0) {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSubmit?.();
            }
            return;
        }
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlight((h) => (h + 1) % results.length);
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlight((h) => (h - 1 + results.length) % results.length);
        } else if (e.key === "Enter" || e.key === "Tab") {
            e.preventDefault();
            insertMention(results[highlight].username);
        } else if (e.key === "Escape") {
            setShowDropdown(false);
        }
    };

    return (
        <div className={`relative ${className}`}>
            <textarea
                ref={inputRef}
                value={value}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                maxLength={maxLength}
                rows={1}
                className="w-full bg-transparent text-sm text-gray-900 placeholder-gray-400 outline-none resize-none"
                onInput={(e) => {
                    e.target.style.height = "auto";
                    e.target.style.height = e.target.scrollHeight + "px";
                }}
            />

            {showDropdown && results.length > 0 && (
                <div
                    ref={dropdownRef}
                    className="absolute z-30 bottom-full mb-1 left-0 w-64 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden max-h-48 overflow-y-auto"
                >
                    {results.map((u, i) => (
                        <button
                            key={u._id || u.username}
                            type="button"
                            onClick={() => insertMention(u.username)}
                            className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-gray-50 transition-colors ${
                                i === highlight ? "bg-gray-100" : ""
                            }`}
                        >
                            <div
                                className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                                style={{ backgroundColor: u.avatarColor }}
                            >
                                {u.avatarUrl ? (
                                    <img src={u.avatarUrl} alt="" className="w-full h-full rounded-full object-cover" />
                                ) : (
                                    u.username?.[0]?.toUpperCase()
                                )}
                            </div>
                            <span className="font-medium text-gray-900 truncate">{u.username}</span>
                        </button>
                    ))}
                </div>
            )}

            {value.trim() && (
                <div className="flex items-center justify-between mt-1">
                    {value.length > maxLength - 50 && (
                        <span className={`text-xs ${value.length >= maxLength ? "text-red-500" : "text-gray-400"}`}>
                            {maxLength - value.length}
                        </span>
                    )}
                    <button
                        type="button"
                        onClick={onSubmit}
                        disabled={submitting || !value.trim()}
                        className="ml-auto text-xs font-bold text-blue-500 hover:text-blue-600 disabled:opacity-50"
                    >
                        {submitting ? "…" : submitLabel}
                    </button>
                </div>
            )}
        </div>
    );
}
