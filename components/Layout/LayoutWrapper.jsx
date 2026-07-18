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
    const { socket, voiceOpen, closeVoiceChat } = useVoiceChat();
    const [unreadCount, setUnreadCount] = useState(0);

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
        fetchUnread();
        const id = setInterval(fetchUnread, 15000);
        return () => clearInterval(id);
    }, [fetchUnread, user]);

    return (
        <>
            <Sidebar open={sidebarOpen} onClose={closeSidebar} unreadCount={unreadCount} />

            <div className={`pb-14 lg:pb-0 ${collapsed ? "lg:pl-20" : "lg:pl-72"}`}>
                {children}
            </div>
            <BottomNav unreadCount={unreadCount} />

            {/* Voice Chat Panel - slides in from right */}
            <div className={`fixed top-0 right-0 h-full z-50 transition-transform duration-300 ease-in-out ${
                voiceOpen ? "translate-x-0" : "translate-x-full"
            } ${collapsed ? "lg:left-20" : "lg:left-72"}`}>
                <div className="h-full w-80 bg-white dark:bg-gray-950 border-l border-gray-200 dark:border-gray-800 shadow-xl overflow-y-auto">
                    <VoiceChat socket={socket} isOpen={voiceOpen} onClose={closeVoiceChat} />
                </div>
            </div>

            {/* Backdrop for voice chat on mobile */}
            {voiceOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-40 lg:hidden"
                    onClick={closeVoiceChat}
                />
            )}
        </>
    );
}
