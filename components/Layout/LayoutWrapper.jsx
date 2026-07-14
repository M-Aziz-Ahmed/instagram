"use client";

import { useEffect } from "react";
import BottomNav from "./BottomNav";
import { useSidebar } from "@/context/SidebarContext";
import { useUser } from "@/context/UserContext";

export default function LayoutWrapper({ children }) {
    const { collapsed } = useSidebar();
    const { user } = useUser();

    useEffect(() => {
        if (!user) return;
        const ping = () => {
            fetch(`/api/users/${encodeURIComponent(user.username)}/active`, { method: "POST" }).catch(() => {});
        };
        ping();
        const id = setInterval(ping, 60000);
        return () => clearInterval(id);
    }, [user]);

    return (
        <>
            <div className={`pb-14 lg:pb-0 ${collapsed ? "lg:pl-20" : "lg:pl-72"}`}>
                {children}
            </div>
            <BottomNav />
        </>
    );
}
