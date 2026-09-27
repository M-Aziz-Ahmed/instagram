"use client";

import { useEffect, useState } from "react";
import { CallProvider } from "@/context/CallContext";
import CallModal from "@/components/Inbox/CallModal";
import { useUser } from "@/context/UserContext";
import { getActiveChat } from "@/utils/activeChat";
import { showBackgroundNotification, isTauri } from "@/utils/systemNotification";
import { hasActivePushSubscription } from "@/utils/notifications";

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

                // Real-time DM notifications for a background/closed app.
                //
                // This socket event is the *only* delivery for a connected
                // client, and it is what covers a minimised tab: the server
                // skips nothing here, so both this and the web push arrive, and
                // they share a `dm_<from>` tag so the platform replaces one with
                // the other instead of stacking both.
                //
                // It is skipped entirely when a push subscription exists, since
                // the service worker then raises the notification itself and can
                // do it with the right tag and click target. See
                // hasActivePushSubscription.
                sock.on("message:new", (data) => {
                    if (!data?.from) return;
                    // On desktop we rely on native tray notifications regardless
                    // of document visibility; in a browser only notify when the
                    // page is actually in the background.
                    if (!isTauri() && typeof document !== "undefined" && !document.hidden) return;
                    if (getActiveChat() === data.from) return;
                    hasActivePushSubscription().then((swHandlesIt) => {
                        if (swHandlesIt) return;
                        showBackgroundNotification(`${data.from} sent you a message`, {
                            body: data.body || "",
                            url: `/inbox?user=${encodeURIComponent(data.from)}`,
                            tag: `dm_${data.from}`,
                        });
                    });
                });
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
