"use client";

import { UserProvider } from "@/context/UserContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { ToastProvider } from "@/context/ToastContext";
import { SidebarProvider } from "@/context/SidebarContext";
import ErrorBoundary from "@/components/ErrorBoundary";
import OnlineStatusTracker from "@/components/OnlineStatusTracker";
import { useEffect } from "react";

export default function Providers({ children }) {
    useEffect(() => {
        // Register service worker for PWA
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker
                .register('/sw.js')
                .then((registration) => {
                    console.log('Service Worker registered:', registration);
                })
                .catch((error) => {
                    console.log('Service Worker registration failed:', error);
                });
        }
    }, []);

    return (
        <ThemeProvider>
            <SidebarProvider>
                <UserProvider>
                    <ToastProvider>
                        <ErrorBoundary>
                            <OnlineStatusTracker />
                            {children}
                        </ErrorBoundary>
                    </ToastProvider>
                </UserProvider>
            </SidebarProvider>
        </ThemeProvider>
    );
}
