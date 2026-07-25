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
                const { getSocketConfig } = await import("@/utils/socketClient");
                if (cancelled) return;
                const { url, config } = getSocketConfig({
                    username: user.username,
                    reconnectionAttempts: 30,
                    reconnectionDelayMax: 15000,
                    timeout: 15000,
                });
                sock = io(url, config);
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
