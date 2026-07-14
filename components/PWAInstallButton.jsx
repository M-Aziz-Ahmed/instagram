"use client";

import { useEffect, useState } from "react";

export default function PWAInstallButton({ onInstall }) {
    const [deferredPrompt, setDeferredPrompt] = useState(null);
    const [canInstall, setCanInstall] = useState(false);
    const [isInstalled, setIsInstalled] = useState(false);

    useEffect(() => {
        // Check if already installed
        if (window.matchMedia('(display-mode: standalone)').matches) {
            setIsInstalled(true);
            return;
        }

        // Check if installed as PWA (iOS)
        if (window.navigator.standalone === true) {
            setIsInstalled(true);
            return;
        }

        // Capture the beforeinstallprompt event
        const handler = (e) => {
            e.preventDefault();
            setDeferredPrompt(e);
            setCanInstall(true);
        };

        window.addEventListener('beforeinstallprompt', handler);

        // For browsers that don't support beforeinstallprompt (iOS Safari)
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
        if (isIOS && isSafari && !window.navigator.standalone) {
            setCanInstall(true);
        }

        return () => {
            window.removeEventListener('beforeinstallprompt', handler);
        };
    }, []);

    const handleInstall = async () => {
        if (!deferredPrompt) {
            // Show manual instructions for iOS or other browsers
            showManualInstructions();
            if (onInstall) onInstall();
            return;
        }

        // Show the browser's install prompt
        deferredPrompt.prompt();

        // Wait for the user's response
        const { outcome } = await deferredPrompt.userChoice;
        
        if (outcome === 'accepted') {
            console.log('User accepted the install prompt');
            setCanInstall(false);
            setIsInstalled(true);
            if (onInstall) onInstall();
        }

        setDeferredPrompt(null);
    };

    const showManualInstructions = () => {
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

        let title = 'Install AnonFeed';
        let instructions = '';

        if (isIOS && isSafari) {
            instructions = '1. Tap the Share button (⬆️) at the bottom\n2. Scroll and tap "Add to Home Screen"\n3. Tap "Add" to confirm';
        } else if (/Android/i.test(navigator.userAgent)) {
            instructions = '1. Tap the menu (⋮) in your browser\n2. Select "Add to Home screen" or "Install app"\n3. Confirm the installation';
        } else {
            instructions = '1. Look for the install icon (⊕) in your browser\'s address bar\n2. Click it to install\n\nOr check your browser menu for "Install" option';
        }

        alert(`${title}\n\n${instructions}`);
    };

    // Don't show if already installed or can't install
    if (isInstalled) {
        return (
            <button
                className="flex items-center gap-3 px-4 py-3 text-sm text-gray-500 dark:text-gray-600 cursor-default"
                disabled
            >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
                <span className="font-medium">App Installed</span>
            </button>
        );
    }

    return (
        <button
            onClick={handleInstall}
            className="flex items-center gap-3 px-4 py-3 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors rounded-lg min-h-[44px]"
        >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            <span className="font-medium">Install App</span>
        </button>
    );
}
