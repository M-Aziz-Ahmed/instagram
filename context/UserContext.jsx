"use client";

import { createContext, useContext, useEffect, useState } from "react";

const STORAGE_KEY = "ig_clone_user";

// A small palette of avatar background colors
export const AVATAR_COLORS = [
    "#f97316", // orange
    "#ec4899", // pink
    "#8b5cf6", // violet
    "#06b6d4", // cyan
    "#10b981", // emerald
    "#f59e0b", // amber
    "#ef4444", // red
    "#3b82f6", // blue
];

function randomColor() {
    return AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
}

const UserContext = createContext(null);

export function UserProvider({ children }) {
    const [user, setUser] = useState(null);   // { username, color }
    const [ready, setReady] = useState(false);

    // Hydrate from localStorage on mount
    useEffect(() => {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) setUser(JSON.parse(raw));
        } catch { /* ignore */ }
        setReady(true);
    }, []);

    const saveUser = (username, color) => {
        const u = { username: username.trim(), color: color || randomColor() };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(u));
        setUser(u);
    };

    const clearUser = () => {
        localStorage.removeItem(STORAGE_KEY);
        setUser(null);
    };

    return (
        <UserContext.Provider value={{ user, ready, saveUser, clearUser, AVATAR_COLORS }}>
            {children}
        </UserContext.Provider>
    );
}

export function useUser() {
    const ctx = useContext(UserContext);
    if (!ctx) throw new Error("useUser must be used inside <UserProvider>");
    return ctx;
}
