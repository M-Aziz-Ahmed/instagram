"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

export const AVATAR_COLORS = [
    "#f97316", "#ec4899", "#8b5cf6", "#06b6d4",
    "#10b981", "#f59e0b", "#ef4444", "#3b82f6",
];

const defaultValue = {
    user:        null,
    ready:       false,
    reloadUser:  () => {},
    logout:      async () => {},
    AVATAR_COLORS,
};

const UserContext = createContext(defaultValue);

export function UserProvider({ children }) {
    const [user, setUser]   = useState(null);
    const [ready, setReady] = useState(false);

    const reloadUser = useCallback(async (userData) => {
        if (userData !== undefined) {
            setUser(userData);
            setReady(true);
            return;
        }
        try {
            const res = await fetch("/api/auth/me");
            if (res.ok) {
                const data = await res.json();
                setUser(data.user ?? null);
            }
        } catch { /* silent */ }
        setReady(true);
    }, []);

    useEffect(() => { reloadUser(); }, [reloadUser]);

    const logout = async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        setUser(null);
    };

    return (
        <UserContext.Provider value={{ user, ready, reloadUser, logout, AVATAR_COLORS }}>
            {children}
        </UserContext.Provider>
    );
}

export function useUser() {
    const ctx = useContext(UserContext);
    // Backwards-compat shim: expose user.color = user.avatarColor
    if (ctx.user && ctx.user.avatarColor && !ctx.user.color) {
        ctx.user = { ...ctx.user, color: ctx.user.avatarColor };
    }
    return ctx;
}
