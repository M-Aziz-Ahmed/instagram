"use client";

import { useEffect, useState } from "react";
import { CallProvider } from "@/context/CallContext";
import CallModal from "@/components/Inbox/CallModal";
import { useUser } from "@/context/UserContext";

function CallSocketProvider({ children }) {
    const { user } = useUser();
    const [socket, setSocket] = useState(null);

    useEffect(() => {
        if (!user?.username) return;

        let cancelled = false;
        let sock = null;

        const connect = async () => {
            try {
                const { io } = await import("socket.io-client");
                if (cancelled) return;
                const wsUrl = process.env.NEXT_PUBLIC_LIVE_SERVER_URL || "http://localhost:3001";
                sock = io({
                    query: { username: user.username },
                    path: "/api/sio",
                    transports: ["polling"],
                    upgrade: false,
                    rememberUpgrade: false,
                    reconnectionAttempts: 30,
                    reconnectionDelay: 1000,
                    reconnectionDelayMax: 15000,
                    timeout: 30000,
                });
                sock.on("connect", () => {
                    if (!cancelled) setSocket(sock);
                });
                sock.on("disconnect", () => {});
                sock.on("connect_error", () => {});
            } catch {}
        };

        connect();

        return () => {
            cancelled = true;
            if (sock) {
                sock.removeAllListeners();
                sock.disconnect();
            }
            setSocket(null);
        };
    }, [user?.username]);

    return (
        <CallProvider socket={socket}>
            {children}
            <CallModal />
        </CallProvider>
    );
}

export default function CallWrapper({ children }) {
    return <CallSocketProvider>{children}</CallSocketProvider>;
}
