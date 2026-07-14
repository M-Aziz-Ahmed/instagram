"use client";

import { useEffect, useState } from "react";

export default function PWAInstallPrompt() {
    const [deferredPrompt, setDeferredPrompt] = useState(null);
    const [showPrompt, setShowPrompt] = useState(false);
    const [isInstalled, setIsInstalled] = useState(false);

    useEffect(() => {
        // Check if already installed
        if (window.matchMedia('(display-mode: standalone)').matches) {
            setIsInstalled(true);
            return;
        }

        // Check if user previously dismissed
        const dismissed = localStorage.getItem('pwa-install-dismissed');
        const dismissedTime = dismissed ? parseInt(dismissed) : 0;
        const daysSinceDismissed = (Date.now() - dismissedTime) / (1000 * 60 * 60 * 24);

        // Don't show if dismissed within last 7 days
        if (daysSinceDismissed < 7) {
            return;
        }

        // Capture the beforeinstallprompt event
        const handler = (e) => {
            // Prevent the default browser prompt
            e.preventDefault();
            // Save the event for later use
            setDeferredPrompt(e);
            // Show our custom prompt after user has spent some time
            setTimeout(() => {
                setShowPrompt(true);
            }, 10000); // Show after 10 seconds
        };

        window.addEventListener('beforeinstallprompt', handler);

        // Listen for successful installation
        window.addEventListener('appinstalled', () => {
            setIsInstalled(true);
            setShowPrompt(false);
            setDeferredPrompt(null);
            console.log('PWA installed successfully!');
        });

        return () => {
            window.removeEventListener('beforeinstallprompt', handler);
        };
    }, []);

    const handleInstallClick = async () => {
        if (!deferredPrompt) {
            // Fallback: Show manual instructions
            showManualInstructions();
            return;
        }

        // Show the browser's install prompt
        deferredPrompt.prompt();

        // Wait for the user's response
        const { outcome } = await deferredPrompt.userChoice;
        
        if (outcome === 'accepted') {
            console.log('User accepted the install prompt');
            setShowPrompt(false);
        } else {
            console.log('User dismissed the install prompt');
        }

        // Clear the deferredPrompt
        setDeferredPrompt(null);
    };

    const handleDismiss = () => {
        setShowPrompt(false);
        localStorage.setItem('pwa-install-dismissed', Date.now().toString());
    };

    const showManualInstructions = () => {
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

        let instructions = '';
        if (isIOS && isSafari) {
            instructions = 'Tap the Share button at the bottom, then select "Add to Home Screen"';
        } else if (/Android/i.test(navigator.userAgent)) {
            instructions = 'Tap the menu (⋮) and select "Add to Home screen" or "Install app"';
        } else {
            instructions = 'Click the install icon (⊕) in your browser\'s address bar';
        }

        alert(`Install AnonFeed:\n\n${instructions}`);
    };

    if (isInstalled || !showPrompt) {
        return null;
    }

    return (
        <div className="fixed bottom-20 left-4 right-4 z-50 animate-slide-up sm:left-auto sm:right-4 sm:max-w-sm">
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 p-4 flex flex-col gap-3">
                {/* Close button */}
                <button
                    onClick={handleDismiss}
                    className="absolute top-2 right-2 p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                    aria-label="Dismiss"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                    </svg>
                </button>

                {/* App icon */}
                <div className="flex items-start gap-3">
                    <div className="w-12 h-12 rounded-xl bg-black dark:bg-white flex items-center justify-center text-white dark:text-black font-black text-2xl shrink-0">
                        A
                    </div>
                    <div className="flex-1 pt-1">
                        <h3 className="font-bold text-sm text-gray-900 dark:text-gray-100 mb-1">
                            Install AnonFeed
                        </h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                            Get quick access and an app-like experience. Works offline!
                        </p>
                    </div>
                </div>

                {/* Action buttons */}
                <div className="flex gap-2">
                    <button
                        onClick={handleDismiss}
                        className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    >
                        Not now
                    </button>
                    <button
                        onClick={handleInstallClick}
                        className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold bg-black dark:bg-white text-white dark:text-black hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors"
                    >
                        Install
                    </button>
                </div>
            </div>
        </div>
    );
}
