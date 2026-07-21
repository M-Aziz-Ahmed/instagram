"use client";

import { useState } from "react";

export default function ImportDataButton({ 
    className = "",
    showLabel = true,
    size = "md",
    onSuccess,
    onError,
}) {
    const [isImporting, setIsImporting] = useState(false);
    const [toast, setToast] = useState(null);

    const handleImport = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        e.target.value = "";

        if (!file.name.endsWith(".json")) {
            showToast("Please select a JSON file", "error");
            return;
        }

        setIsImporting(true);
        try {
            const text = await file.text();
            const data = JSON.parse(text);

            if (!data.bookmarks || !Array.isArray(data.bookmarks)) {
                showToast("Invalid file format: missing 'bookmarks' array", "error");
                return;
            }

            const res = await fetch("/api/media-bookmarks/import", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify(data),
            });

            const result = await res.json();
            if (!res.ok) throw new Error(result.error || "Import failed");

            const count = result.imported ?? 0;
            showToast(
                count > 0 ? `Imported ${count} bookmarks` : "No new bookmarks to import (duplicates skipped)",
                count > 0 ? "success" : "info"
            );
            onSuccess?.(result);
        } catch (err) {
            console.error("Import error:", err);
            showToast(err.message || "Import failed", "error");
            onError?.(err);
        } finally {
            setIsImporting(false);
        }
    };

    const showToast = (message, type = "info") => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 4000);
    };

    const sizeClasses = {
        sm: "px-2 py-1 text-xs",
        md: "px-3 py-2 text-sm",
        lg: "px-4 py-2 text-base",
    };

    const iconSize = size === "sm" ? "h-3.5 w-3.5" : size === "md" ? "h-4 w-4" : "h-5 w-5";

    return (
        <div className="relative inline-flex">
            <button
                onClick={() => document.getElementById("import-data-file")?.click()}
                disabled={isImporting}
                className={`
                    inline-flex items-center gap-2 rounded-lg font-medium transition-colors
                    focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                    dark:focus:ring-offset-gray-900
                    disabled:opacity-50 disabled:cursor-not-allowed
                    ${sizeClasses[size]} ${className}
                `}
            >
                <svg
                    className={iconSize}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                {showLabel && <span>Import Data</span>}
                {isImporting && (
                    <svg className={`animate-spin ${iconSize}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                        <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
                    </svg>
                )}
            </button>

            <input
                id="import-data-file"
                type="file"
                accept=".json"
                className="hidden"
                onChange={handleImport}
                disabled={isImporting}
            />

            {toast && (
                <div
                    className={`
                        fixed bottom-4 right-4 z-50 animate-toast-in
                        px-4 py-3 rounded-lg shadow-lg text-white text-sm font-medium
                        flex items-center gap-2 min-w-[280px] max-w-md
                        ${type === "success" ? "bg-green-600" : type === "error" ? "bg-red-600" : "bg-blue-600"}
                    `}
                    role="alert"
                >
                    {toast.message}
                </div>
            )}
        </div>
    );
}