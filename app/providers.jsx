"use client";

import { UserProvider } from "@/context/UserContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { ToastProvider } from "@/context/ToastContext";
import { SidebarProvider } from "@/context/SidebarContext";

export default function Providers({ children }) {
    return (
        <ThemeProvider>
            <SidebarProvider>
                <UserProvider>
                    <ToastProvider>
                        {children}
                    </ToastProvider>
                </UserProvider>
            </SidebarProvider>
        </ThemeProvider>
    );
}
