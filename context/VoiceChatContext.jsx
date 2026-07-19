"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import { useUser } from "@/context/UserContext";

const LIVE_SERVER = process.env.NEXT_PUBLIC_LIVE_SERVER_URL;

const VoiceChatContext = createContext({
    socket: null,
    voiceOpen: false,
    openVoiceChat: () => {},
    closeVoiceChat: () => {},
});

export function VoiceChatProvider({ children }) {
    const { user } = useUser();
    const [socket, setSocket] = useState(null);
    const [voiceOpen, setVoiceOpen] = useState(false);

    useEffect(() => {
        if (!LIVE_SERVER || !user?.username) return;
        const s = io(LIVE_SERVER, {
            query: { username: user.username },
            transports: ["polling", "websocket"],
            upgrade: true,
            rememberUpgrade: false,
            reconnectionAttempts: 30,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 15000,
            timeout: 30000,
            withCredentials: true,
        });
        setSocket(s);
        return () => { s.disconnect(); setSocket(null); };
    }, [user?.username]);

    const openVoiceChat = useCallback(() => setVoiceOpen(true), []);
    const closeVoiceChat = useCallback(() => setVoiceOpen(false), []);

    const value = useMemo(
        () => ({ socket, voiceOpen, openVoiceChat, closeVoiceChat }),
        [socket, voiceOpen, openVoiceChat, closeVoiceChat]
    );

    return <VoiceChatContext.Provider value={value}>{children}</VoiceChatContext.Provider>;
}

export function useVoiceChat() {
    return useContext(VoiceChatContext);
}
