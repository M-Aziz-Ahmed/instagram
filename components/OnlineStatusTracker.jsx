"use client";

import { useUser } from "@/context/UserContext";
import { useOnlineStatus } from "@/utils/useOnlineStatus";

/**
 * Global component that tracks current user's online status
 * This component doesn't render anything, it just handles the side effect
 */
export default function OnlineStatusTracker() {
    const { user } = useUser();
    
    // This hook will automatically track and broadcast online status
    useOnlineStatus(user?.username);
    
    return null;
}
