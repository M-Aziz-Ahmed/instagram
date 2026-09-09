"use client";

import { useEffect, useState, useCallback } from "react";
import BottomNav from "./BottomNav";
import Sidebar from "./Sidebar";
import VoiceChat from "@/components/VoiceChat/VoiceChat";
import { useSidebar } from "@/context/SidebarContext";
import { useUser } from "@/context/UserContext";
import { useVoiceChat } from "@/context/VoiceChatContext";

export default function LayoutWrapper({ children }) {
    const { collapsed, sidebarOpen, closeSidebar } = useSidebar();
    const { user } = useUser();
    const { voiceOpen, closeVoiceChat } = useVoiceChat();
    const [unreadCount, setUnreadCount] = useState(0);

    // Breakpoints: mobile < 768px (md), tablet 768-1024px (md-lg), desktop ≥ 1024px (lg)
    // Only mount ONE VoiceChat instance (desktop drawer OR mobile bottom sheet).
    // Previously both were mounted simultaneously on mobile, so the hidden
    // desktop panel listened on the same socket and produced duplicate joins.
    const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.innerWidth < 768);
    const [isTablet, setIsTablet] = useState(() => typeof window !== "undefined" && window.innerWidth >= 768 && window.innerWidth < 1024);
    useEffect(() => {
        const mobileMq = window.matchMedia("(max-width: 767.98px)");
        const tabletMq = window.matchMedia("(min-width: 768px) and (max-width: 1023.98px)");
        const mobileHandler = (e) => setIsMobile(e.matches);
        const tabletHandler = (e) => setIsTablet(e.matches);
        mobileMq.addEventListener?.("change", mobileHandler);
        tabletMq.addEventListener?.("change", tabletHandler);
        return () => {
            mobileMq.removeEventListener?.("change", mobileHandler);
            tabletMq.removeEventListener?.("change", tabletHandler);
        };
    }, []);

    useEffect(() => {
        if (!user) return;
        const ping = () => {
            fetch(`/api/users/${encodeURIComponent(user.username)}/active`, { method: "POST" }).catch(() => {});
        };
        ping();
        const id = setInterval(ping, 60000);
        return () => clearInterval(id);
    }, [user]);

    // Centralized unread message polling — single source of truth
    const fetchUnread = useCallback(async () => {
        if (!user?.username) return;
        try {
            const res = await fetch(`/api/messages/unread?username=${encodeURIComponent(user.username)}`, {
                credentials: 'include'
            });
            if (res.ok) {
                const data = await res.json();
                setUnreadCount(data?.total || 0);
            }
        } catch {
            // silent — network errors on background poll are expected
        }
    }, [user]);

    useEffect(() => {
        if (!user?.username) return;
        const id = setInterval(fetchUnread, 15000);
        const init = setTimeout(fetchUnread, 0);
        return () => { clearInterval(id); clearTimeout(init); };
    }, [fetchUnread, user]);

    return (
        <>
            <Sidebar open={sidebarOpen} onClose={closeSidebar} unreadCount={unreadCount} />

            <div className={`transition-all duration-300 ${
                isMobile ? "pb-14" : 
                isTablet ? "pb-0 pl-20" : 
                collapsed ? "lg:pl-20" : "lg:pl-72"
            } ${voiceOpen && !isMobile ? "lg:pr-80" : ""}`}>
                {children}
            </div>
            <BottomNav unreadCount={unreadCount} />

            {/* Voice Chat Panel - right sidebar on desktop, bottom sheet on mobile/tablet */}
            {/* Desktop (≥1024px): slides from right */}
            {!isMobile && !isTablet && voiceOpen && (
                <div className="fixed top-0 right-0 h-full w-80 z-50 lg:block hidden">
                    <div className="h-full w-80 bg-white dark:bg-gray-950 border-l border-gray-200 dark:border-gray-800 shadow-xl overflow-y-auto">
                        <VoiceChat isOpen={voiceOpen} onClose={closeVoiceChat} />
                    </div>
                </div>
            )}

            {/* Mobile (<768px): bottom sheet */}
            {isMobile && voiceOpen && (
                <div className="fixed inset-0 z-50 lg:hidden">
                    <div className="absolute inset-0 bg-black/50" onClick={closeVoiceChat} />
                    <div className="absolute bottom-0 left-0 right-0 h-[75vh] max-h-[calc(100vh-env(safe-area-inset-bottom))] bg-gray-950 rounded-t-2xl shadow-2xl overflow-hidden flex flex-col animate-slide-up safe-bottom">
                        {/* Drag handle */}
                        <div className="flex justify-center pt-3 pb-1 shrink-0">
                            <div className="w-10 h-1 bg-gray-600 rounded-full" />
                        </div>
                        <div className="flex-1 overflow-y-auto">
                            <VoiceChat isOpen={voiceOpen} onClose={closeVoiceChat} />
                        </div>
                    </div>
                </div>
            )}

            {/* Tablet (768-1024px): right panel with reduced width */}
            {isTablet && voiceOpen && (
                <div className="fixed top-0 right-0 h-full w-72 z-50 hidden lg:block">
                    <div className="h-full w-72 bg-white dark:bg-gray-950 border-l border-gray-200 dark:border-gray-800 shadow-xl overflow-y-auto">
                        <VoiceChat isOpen={voiceOpen} onClose={closeVoiceChat} />
                    </div>
                </div>
            )}
        </>
    );
}
