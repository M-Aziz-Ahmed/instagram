"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import { useUser } from "@/context/UserContext";

const LIVE_SERVER = process.env.NEXT_PUBLIC_LIVE_SERVER_URL;

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

    const createSocket = useCallback(() => {
        if (!LIVE_SERVER || !user?.username) return;
        setSocketError(null);
        const s = io(LIVE_SERVER, {
            query: { username: user.username },
            transports: ["polling", "websocket"],
            upgrade: true,
            rememberUpgrade: false,
            reconnectionAttempts: 10,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            timeout: 15000,
            withCredentials: true,
        });
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
        setSocket(s);
        return s;
    }, [user?.username]);

    useEffect(() => {
        const s = createSocket();
        return () => { s?.disconnect(); setSocket(null); setSocketError(null); reconnectCountRef.current = 0; };
    }, [createSocket]);

    const reconnectSocket = useCallback(() => {
        reconnectCountRef.current = 0;
        socket?.disconnect();
        createSocket();
    }, [socket, createSocket]);

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
