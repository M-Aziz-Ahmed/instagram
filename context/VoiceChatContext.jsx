"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import { useUser } from "@/context/UserContext";
import { getSocketConfig } from "@/utils/socketClient";

const VoiceChatContext = createContext({
    socket: null,
    voiceOpen: false,
    socketError: null,
    openVoiceChat: () => {},
    closeVoiceChat: () => {},
    reconnectSocket: () => {},
});

export function VoiceChatProvider({ children }) {
    const { user } = useUser();
    const [socket, setSocket] = useState(null);
    const [voiceOpen, setVoiceOpen] = useState(false);
    const [socketError, setSocketError] = useState(null);
    const reconnectCountRef = useRef(0);

    useEffect(() => {
        if (!user?.username) return;

        let alive = true;
        const { url, config } = getSocketConfig({
            username: user.username,
            reconnectionAttempts: 10,
            timeout: 15000,
        });

        const s = io(url, config);

        s.on("connect_error", (err) => {
            console.warn("[VoiceChat] Connection error:", err?.message || err);
            reconnectCountRef.current++;
            if (reconnectCountRef.current >= 3) {
                setSocketError("Could not reach voice server. Check your connection and try again.");
            }
        });

        s.on("connect", () => {
            reconnectCountRef.current = 0;
            setSocketError(null);
        });

        if (alive) setSocket(s);

        return () => {
            alive = false;
            s?.removeAllListeners();
            s?.disconnect();
            setSocket(null);
            setSocketError(null);
            reconnectCountRef.current = 0;
        };
    }, [user?.username]);

    const reconnectSocket = useCallback(() => {
        reconnectCountRef.current = 0;
        setSocketError(null);
        socket?.disconnect();
    }, [socket]);

    const openVoiceChat = useCallback(() => setVoiceOpen(true), []);
    const closeVoiceChat = useCallback(() => setVoiceOpen(false), []);

    const value = useMemo(
        () => ({ socket, voiceOpen, socketError, openVoiceChat, closeVoiceChat, reconnectSocket }),
        [socket, voiceOpen, socketError, openVoiceChat, closeVoiceChat, reconnectSocket]
    );

    return <VoiceChatContext.Provider value={value}>{children}</VoiceChatContext.Provider>;
}

export function useVoiceChat() {
    return useContext(VoiceChatContext);
}
