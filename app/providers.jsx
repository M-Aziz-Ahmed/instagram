"use client";

import { UserProvider } from "@/context/UserContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { ToastProvider } from "@/context/ToastContext";
import { SidebarProvider } from "@/context/SidebarContext";
import { VoiceChatProvider } from "@/context/VoiceChatContext";
import CallWrapper from "@/components/CallWrapper";
import ErrorBoundary from "@/components/ErrorBoundary";
import OnlineStatusTracker from "@/components/OnlineStatusTracker";
import PushNotificationManager from "@/components/PushNotificationManager";
import ServiceWorkerBridge from "@/components/Notifications/ServiceWorkerBridge";
import FcmPushBridge from "@/components/FcmPushBridge";
import AutoUpdater from "@/components/Updates/AutoUpdater";
import TauriDesktopDiagnostics from "@/components/Tauri/TauriDesktopDiagnostics";
import ServerStatusBanner from "@/components/ServerStatusBanner";
import { useEffect } from "react";
import { installLogInterceptor } from "@/utils/logInterceptor";
import { installPopupGuard } from "@/utils/popupGuard";

export default function Providers({ children }) {
    useEffect(() => {
        installLogInterceptor();
    }, []);

    // Must run before any ad creative or video embed loads, otherwise the first
    // few popups get through while the page is still hydrating.
    useEffect(() => {
        installPopupGuard();
    }, []);

    useEffect(() => {
        if (!('serviceWorker' in navigator)) return;

        // Tell the worker which window is actually in front of the user, on
        // every real transition and nothing else. It uses this to decide whether
        // a push needs to become an OS notification at all.
        //
        // There is deliberately no heartbeat here. A `setInterval` ping is
        // throttled to roughly once a minute in a background tab — which is
        // exactly the tab that most needs to report "I'm hidden" — so a
        // heartbeat-based signal goes stale precisely when it matters and the
        // worker starts notifying people who are looking at the app. Real
        // transitions always fire and cost nothing.
        function announce(visible) {
            navigator.serviceWorker.controller?.postMessage({
                type: 'app_visibility',
                visible,
            });
        }

        const onVisibilityChange = () => announce(document.visibilityState === 'visible');
        const onFocus = () => announce(true);
        const onBlur = () => announce(false);
        const onControllerChange = () => announce(document.visibilityState === 'visible');

        document.addEventListener('visibilitychange', onVisibilityChange);
        window.addEventListener('focus', onFocus);
        window.addEventListener('blur', onBlur);
        navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

        // `updateViaCache: 'none'` matters here. The browser otherwise applies
        // its own HTTP cache to the worker script, which means a fix to the
        // notification logic can sit undeployed for up to 24h — the symptom
        // being a push that arrives with no accept/decline buttons because the
        // page is running a stale worker.
        navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => {});
        navigator.serviceWorker.ready.then(() => {
            announce(document.visibilityState === 'visible');
        });

        return () => {
            document.removeEventListener('visibilitychange', onVisibilityChange);
            window.removeEventListener('focus', onFocus);
            window.removeEventListener('blur', onBlur);
            navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
        };
    }, []);

    return (
        <ThemeProvider>
            <SidebarProvider>
                <UserProvider>
                    <VoiceChatProvider>
                        <ToastProvider>
                            <ErrorBoundary>
                                <CallWrapper>
                                    {children}
                                </CallWrapper>
                                <OnlineStatusTracker />
                                <ServerStatusBanner />
                                <PushNotificationManager />
                                <ServiceWorkerBridge />
                                <FcmPushBridge />
                                <AutoUpdater />
                                <TauriDesktopDiagnostics />
                            </ErrorBoundary>
                        </ToastProvider>
                    </VoiceChatProvider>
                </UserProvider>
            </SidebarProvider>
        </ThemeProvider>
    );
}
