"use client";

import { useEffect } from "react";
import BottomNav from "./BottomNav";
import VoiceChat from "@/components/VoiceChat/VoiceChat";
import { useSidebar } from "@/context/SidebarContext";
import { useUser } from "@/context/UserContext";
import { useVoiceChat } from "@/context/VoiceChatContext";

export default function LayoutWrapper({ children }) {
    const { collapsed } = useSidebar();
    const { user } = useUser();
    const { socket, voiceOpen, closeVoiceChat } = useVoiceChat();

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
