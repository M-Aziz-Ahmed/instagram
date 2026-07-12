"use client";

import { UserProvider } from "@/context/UserContext";

export default function Providers({ children }) {
    return <UserProvider>{children}</UserProvider>;
}
