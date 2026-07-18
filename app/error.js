"use client";

import { useEffect } from "react";

export default function Error({ error, reset }) {
    useEffect(() => {
        console.error(error);
    }, [error]);

    return (
        <div className="min-h-screen bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 flex items-center justify-center p-6">
            <div className="max-w-2xl w-full rounded-3xl border border-red-100 dark:border-red-900/30 bg-red-50 dark:bg-red-950/30 p-8 shadow-lg">
                <h1 className="text-2xl font-bold text-red-700 dark:text-red-400 mb-4">Something went wrong</h1>
                <p className="text-gray-700 dark:text-gray-300 mb-6">Your page encountered an unexpected error. This is not a login issue.</p>
                <pre className="whitespace-pre-wrap text-sm text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-4 overflow-auto max-h-72">
                    {error?.message || "Unknown error"}
                </pre>
                <div className="mt-6 flex gap-3">
                    <button
                        onClick={() => reset()}
                        className="px-4 py-2 bg-red-600 text-white rounded-xl hover:bg-red-700 transition"
                    >
                        Try again
                    </button>
                    <button
                        onClick={() => window.location.reload()}
                        className="px-4 py-2 bg-white dark:bg-gray-900 text-red-600 dark:text-red-400 border border-red-600 dark:border-red-400 rounded-xl hover:bg-red-50 dark:hover:bg-red-950/50 transition"
                    >
                        Reload page
                    </button>
                </div>
            </div>
        </div>
    );
}
