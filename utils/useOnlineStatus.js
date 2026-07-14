import { useEffect, useRef } from 'react';

/**
 * Hook to track and broadcast user's online status
 * Updates server every 2 minutes and on visibility change
 */
export function useOnlineStatus(username) {
    const intervalRef = useRef(null);
    const isOnlineRef = useRef(true);

    useEffect(() => {
        if (!username) return;

        const updateStatus = async (isOnline) => {
            try {
                await fetch(`/api/users/${encodeURIComponent(username)}/active`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ isOnline }),
                });
            } catch (err) {
                console.warn('Failed to update online status:', err);
            }
        };

        const handleVisibilityChange = () => {
            const isVisible = document.visibilityState === 'visible';
            isOnlineRef.current = isVisible;
            updateStatus(isVisible);
        };

        const handleBeforeUnload = () => {
            // Use sendBeacon for reliable last-minute update
            if (navigator.sendBeacon) {
                const blob = new Blob(
                    [JSON.stringify({ isOnline: false })],
                    { type: 'application/json' }
                );
                navigator.sendBeacon(
                    `/api/users/${encodeURIComponent(username)}/active`,
                    blob
                );
            }
        };

        // Initial status update
        updateStatus(true);

        // Update every 2 minutes to keep status fresh
        intervalRef.current = setInterval(() => {
            if (isOnlineRef.current) {
                updateStatus(true);
            }
        }, 2 * 60 * 1000);

        // Listen for tab visibility changes
        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('beforeunload', handleBeforeUnload);

        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('beforeunload', handleBeforeUnload);
            
            // Mark offline on unmount
            updateStatus(false);
        };
    }, [username]);
}

/**
 * Get formatted "last seen" text for a user
 */
export function getLastSeenText(lastActive, isOnline) {
    if (isOnline) {
        return 'Active now';
    }

    if (!lastActive) {
        return 'Offline';
    }

    const now = Date.now();
    const lastActiveTime = new Date(lastActive).getTime();
    const diffMs = now - lastActiveTime;
    const diffMins = Math.floor(diffMs / (60 * 1000));
    const diffHours = Math.floor(diffMs / (60 * 60 * 1000));
    const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));

    if (diffMins < 1) return 'Active now';
    if (diffMins < 60) return `Active ${diffMins}m ago`;
    if (diffHours < 24) return `Active ${diffHours}h ago`;
    if (diffDays === 1) return 'Active yesterday';
    if (diffDays < 7) return `Active ${diffDays}d ago`;
    
    return 'Offline';
}
