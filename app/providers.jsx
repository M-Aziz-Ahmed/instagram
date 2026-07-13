"use client";

import { UserProvider } from "@/context/UserContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { ToastProvider } from "@/context/ToastContext";

export default function Providers({ children }) {
    return (
        <ThemeProvider>
            <UserProvider>
                <ToastProvider>
                    {children}
                </ToastProvider>
            </UserProvider>
        </ThemeProvider>
    );
}
