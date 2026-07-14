"use client";

import { createContext, useContext, useMemo, useState } from "react";

const SidebarContext = createContext({
    collapsed: false,
    toggleCollapsed: () => {},
});

export function SidebarProvider({ children }) {
    const [collapsed, setCollapsed] = useState(false);
    const contextValue = useMemo(
        () => ({
            collapsed,
            toggleCollapsed: () => setCollapsed((current) => !current),
        }),
        [collapsed]
    );

    return <SidebarContext.Provider value={contextValue}>{children}</SidebarContext.Provider>;
}

export function useSidebar() {
    return useContext(SidebarContext);
}
