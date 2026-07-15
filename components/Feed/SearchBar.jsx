"use client";

import { useRef, useState } from "react";

export default function SearchBar({ onSearch, searchQuery, onClearSearch }) {
    const [mobileOpen, setMobileOpen] = useState(false);
    const [localQuery, setLocalQuery] = useState("");
    const wrapRef = useRef(null);
    const desktopInputRef = useRef(null);
    const mobileInputRef = useRef(null);

    const query = searchQuery !== undefined ? searchQuery : localQuery;

    const handleSubmit = (e) => {
        e.preventDefault();
        if (query.trim()) {
            onSearch?.(query.trim());
            setMobileOpen(false);
        }
    };

    const handleChange = (e) => {
        const val = e.target.value;
        setLocalQuery(val);
        if (searchQuery !== undefined) {
            onSearch?.(val.trim() || null);
        }
    };

    const handleClear = () => {
        setLocalQuery("");
        onClearSearch?.();
        desktopInputRef.current?.focus();
    };

    return (
        <div ref={wrapRef} className="relative flex-1 max-w-xs">
            {/* Mobile: search icon */}
            <button
                onClick={() => setMobileOpen((v) => !v)}
                className="sm:hidden p-2.5 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                aria-label="Search"
            >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
                    strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round"
                        d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                </svg>
            </button>

            {/* Mobile expanded search */}
            {mobileOpen && (
                <div className="sm:hidden fixed inset-x-0 top-14 z-50 px-4">
                    <form onSubmit={handleSubmit} className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden flex items-center">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
                            strokeWidth={1.8} stroke="currentColor" className="w-4 h-4 absolute left-3 text-gray-400 dark:text-gray-500 pointer-events-none">
                            <path strokeLinecap="round" strokeLinejoin="round"
                                d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                        </svg>
                        <input
                            ref={mobileInputRef}
                            type="text"
                            value={query}
                            onChange={handleChange}
                            placeholder="Search\u2026"
                            autoFocus
                            className="w-full pl-9 pr-4 py-3.5 text-sm bg-white dark:bg-gray-900 rounded-2xl outline-none text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 min-h-[48px]"
                        />
                        {query && (
                            <button type="button" onClick={handleClear}
                                className="absolute right-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                                </svg>
                            </button>
                        )}
                    </form>
                </div>
            )}

            {/* Desktop: full search input */}
            <form onSubmit={handleSubmit} className="relative hidden sm:block">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
                    strokeWidth={1.8} stroke="currentColor" className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none">
                    <path strokeLinecap="round" strokeLinejoin="round"
                        d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                </svg>
                <input
                    ref={desktopInputRef}
                    type="text"
                    value={query}
                    onChange={handleChange}
                    placeholder="Search\u2026"
                    className="w-full pl-9 pr-9 py-2.5 text-sm bg-gray-100 dark:bg-gray-800 rounded-full outline-none focus:bg-white dark:focus:bg-gray-700 focus:ring-2 focus:ring-gray-200 dark:focus:ring-gray-600 transition-all text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 min-h-[44px]"
                />
                {query && (
                    <button type="button" onClick={handleClear}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                        </svg>
                    </button>
                )}
            </form>
        </div>
    );
}
