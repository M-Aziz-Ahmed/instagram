"use client";

import { UserProvider } from "@/context/UserContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { ToastProvider } from "@/context/ToastContext";
import { SidebarProvider } from "@/context/SidebarContext";
import { VoiceChatProvider } from "@/context/VoiceChatContext";
import ErrorBoundary from "@/components/ErrorBoundary";
import OnlineStatusTracker from "@/components/OnlineStatusTracker";
import PushNotificationManager from "@/components/PushNotificationManager";
import { useEffect } from "react";

export default function Providers({ children }) {
    useEffect(() => {
        if (!('serviceWorker' in navigator)) return;

        navigator.serviceWorker.register('/sw.js').then((registration) => {
            console.log('Service Worker registered:', registration);
        }).catch((error) => {
            console.log('Service Worker registration failed:', error);
        });

        // Tell the service worker when the app is visible/hidden
        function sendVisibility(visible) {
            navigator.serviceWorker.controller?.postMessage({
                type: 'app_visibility',
                visible,
            });
        }

        const onVisibilityChange = () => {
            sendVisibility(document.visibilityState === 'visible');
        };
        const onFocus = () => sendVisibility(true);
        const onBlur = () => sendVisibility(false);

        document.addEventListener('visibilitychange', onVisibilityChange);
        window.addEventListener('focus', onFocus);
        window.addEventListener('blur', onBlur);

        // Initial state
        sendVisibility(document.visibilityState === 'visible');

        // Heartbeat every 15s so SW knows client is alive
        const heartbeat = setInterval(() => {
            navigator.serviceWorker.controller?.postMessage({ type: 'heartbeat' });
        }, 15000);

        return () => {
            document.removeEventListener('visibilitychange', onVisibilityChange);
            window.removeEventListener('focus', onFocus);
            window.removeEventListener('blur', onBlur);
            clearInterval(heartbeat);
        };
    }, []);

    return (
        <ThemeProvider>
            <SidebarProvider>
                <UserProvider>
                    <VoiceChatProvider>
                        <ToastProvider>
                            <ErrorBoundary>
                                <OnlineStatusTracker />
                                <PushNotificationManager />
                                {children}
                            </ErrorBoundary>
                        </ToastProvider>
                    </VoiceChatProvider>
                </UserProvider>
            </SidebarProvider>
        </ThemeProvider>
    );
}
