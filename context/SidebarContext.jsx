"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

const SidebarContext = createContext({
    collapsed: false,
    toggleCollapsed: () => {},
    sidebarOpen: false,
    openSidebar: () => {},
    closeSidebar: () => {},
});

export function SidebarProvider({ children }) {
    const [collapsed, setCollapsed] = useState(false);
    const [sidebarOpen, setSidebarOpen] = useState(false);

    const toggleCollapsed = useCallback(() => setCollapsed((c) => !c), []);
    const openSidebar = useCallback(() => setSidebarOpen(true), []);
    const closeSidebar = useCallback(() => setSidebarOpen(false), []);

    const contextValue = useMemo(
        () => ({ collapsed, toggleCollapsed, sidebarOpen, openSidebar, closeSidebar }),
        [collapsed, toggleCollapsed, sidebarOpen, openSidebar, closeSidebar]
    );

    return <SidebarContext.Provider value={contextValue}>{children}</SidebarContext.Provider>;
}

export function useSidebar() {
    return useContext(SidebarContext);
}
