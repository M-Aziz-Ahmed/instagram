"use client";

import { UserProvider } from "@/context/UserContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { ToastProvider } from "@/context/ToastContext";
import { SidebarProvider } from "@/context/SidebarContext";
import ErrorBoundary from "@/components/ErrorBoundary";

export default function Providers({ children }) {
    return (
        <ThemeProvider>
            <SidebarProvider>
                <UserProvider>
                    <ToastProvider>
                        <ErrorBoundary>
                            {children}
                        </ErrorBoundary>
                    </ToastProvider>
                </UserProvider>
            </SidebarProvider>
        </ThemeProvider>
    );
}
