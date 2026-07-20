"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";

const ToastContext = createContext({ showToast: () => {} });

let toastId = 0;

export function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([]);
    const timers = useRef({});

    const removeToast = useCallback((id) => {
        clearTimeout(timers.current[id]);
        delete timers.current[id];
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    const showToast = useCallback((message, type = "info") => {
        const id = ++toastId;
        setToasts((prev) => [...prev.slice(-2), { id, message, type }]);
        timers.current[id] = setTimeout(() => removeToast(id), 3500);
    }, [removeToast]);

    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}
            {/* Toast container */}
            <div className="fixed bottom-20 sm:bottom-6 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 pointer-events-none w-[calc(100%-2rem)] max-w-sm">
                {toasts.map((t) => (
                    <div
                        key={t.id}
                        onClick={() => removeToast(t.id)}
                        className={`pointer-events-auto px-4 py-3 rounded-2xl text-sm font-medium shadow-lg border backdrop-blur-sm cursor-pointer animate-toast-in ${
                            t.type === "success"
                                ? "bg-green-50 dark:bg-green-900/40 border-green-200 dark:border-green-800 text-green-800 dark:text-green-200"
                                : t.type === "error"
                                ? "bg-red-50 dark:bg-red-900/40 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200"
                                : "bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200"
                        }`}
                    >
                        <div className="flex items-center gap-2">
                            <span className="shrink-0">
                                {t.type === "success" ? "\u2713" : t.type === "error" ? "\u2715" : "\u2139"}
                            </span>
                            <span className="flex-1">{t.message}</span>
                        </div>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
}

export function useToast() {
    return useContext(ToastContext);
}
