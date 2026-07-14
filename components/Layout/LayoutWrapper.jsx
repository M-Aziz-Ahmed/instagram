"use client";

import BottomNav from "./BottomNav";
import { useSidebar } from "@/context/SidebarContext";

export default function LayoutWrapper({ children }) {
    const { collapsed } = useSidebar();

    return (
        <>
            <div className={`pb-14 lg:pb-0 ${collapsed ? "lg:pl-20" : "lg:pl-72"}`}>
                {children}
            </div>
            <BottomNav />
        </>
    );
}
