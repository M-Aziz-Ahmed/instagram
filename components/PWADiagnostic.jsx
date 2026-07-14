"use client";

import { useEffect, useState } from "react";

export default function PWADiagnostic() {
    const [diagnostics, setDiagnostics] = useState(null);
    const [show, setShow] = useState(false);

    useEffect(() => {
        const runDiagnostics = async () => {
            const results = {
                // Check if already installed
                isInstalled: window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true,
                
                // Check browser
                browser: getBrowser(),
                
                // Check HTTPS
                isHTTPS: window.location.protocol === 'https:' || window.location.hostname === 'localhost',
                
                // Check service worker
                swSupported: 'serviceWorker' in navigator,
                swRegistered: false,
                
                // Check manifest
                manifestFound: false,
                
                // Check beforeinstallprompt support
                supportsPrompt: false,
                
                // Platform
                platform: getPlatform(),
                
                // Install blocked reason
                blockedReason: null,
            };

            // Check service worker registration
            if (results.swSupported) {
                try {
                    const reg = await navigator.serviceWorker.getRegistration();
                    results.swRegistered = !!reg;
                } catch (e) {
                    console.error('SW check failed:', e);
                }
            }

            // Check manifest
            try {
                const manifestLink = document.querySelector('link[rel="manifest"]');
                if (manifestLink) {
                    const response = await fetch(manifestLink.href);
                    results.manifestFound = response.ok;
                }
            } catch (e) {
                console.error('Manifest check failed:', e);
            }

            // Determine blocked reason
            if (results.isInstalled) {
                results.blockedReason = 'Already installed';
            } else if (!results.isHTTPS) {
                results.blockedReason = 'Not served over HTTPS';
            } else if (!results.swRegistered) {
                results.blockedReason = 'Service worker not registered';
            } else if (!results.manifestFound) {
                results.blockedReason = 'Manifest not found';
            } else if (results.platform === 'iOS' && results.browser === 'Safari') {
                results.blockedReason = 'iOS Safari requires manual install';
            } else if (localStorage.getItem('pwa-recently-uninstalled')) {
                results.blockedReason = 'Browser cooldown active (recently uninstalled)';
            } else {
                results.blockedReason = 'Browser may be blocking (try different browser or wait 24-48h)';
            }

            setDiagnostics(results);
        };

        // Listen for beforeinstallprompt
        const handler = (e) => {
            e.preventDefault();
            setDiagnostics(prev => ({ ...prev, supportsPrompt: true, blockedReason: 'Ready to install!' }));
        };
        window.addEventListener('beforeinstallprompt', handler);

        runDiagnostics();

        return () => window.removeEventListener('beforeinstallprompt', handler);
    }, []);

    function getBrowser() {
        const ua = navigator.userAgent;
        if (ua.includes('Edg/')) return 'Edge';
        if (ua.includes('Chrome/') && !ua.includes('Edg/')) return 'Chrome';
        if (ua.includes('Firefox/')) return 'Firefox';
        if (ua.includes('Safari/') && !ua.includes('Chrome/')) return 'Safari';
        if (ua.includes('SamsungBrowser/')) return 'Samsung Internet';
        return 'Unknown';
    }

    function getPlatform() {
        const ua = navigator.userAgent;
        if (/iPad|iPhone|iPod/.test(ua)) return 'iOS';
        if (/Android/.test(ua)) return 'Android';
        if (/Windows/.test(ua)) return 'Windows';
        if (/Mac/.test(ua)) return 'macOS';
        if (/Linux/.test(ua)) return 'Linux';
        return 'Unknown';
    }

    if (!show) {
        return (
            <button
                onClick={() => setShow(true)}
                className="fixed bottom-4 left-4 z-50 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-xs font-bold shadow-lg"
            >
                🔍 Why Can't I Install?
            </button>
        );
    }

    if (!diagnostics) {
        return (
            <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setShow(false)}>
                <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 max-w-lg">
                    <div className="animate-spin w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full mx-auto"></div>
                </div>
            </div>
        );
    }

    const { isInstalled, browser, isHTTPS, swSupported, swRegistered, manifestFound, supportsPrompt, platform, blockedReason } = diagnostics;

    return (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setShow(false)}>
            <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-2xl font-black text-gray-900 dark:text-gray-100">
                        🔍 PWA Install Diagnostic
                    </h2>
                    <button onClick={() => setShow(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Status */}
                <div className={`mb-6 p-4 rounded-xl ${isInstalled ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800' : supportsPrompt ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800' : 'bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800'}`}>
                    <div className="flex items-start gap-3">
                        <span className="text-2xl">{isInstalled ? '✅' : supportsPrompt ? '🎉' : '⚠️'}</span>
                        <div>
                            <h3 className="font-bold text-sm mb-1">{isInstalled ? 'Already Installed!' : supportsPrompt ? 'Ready to Install!' : 'Installation Blocked'}</h3>
                            <p className="text-sm text-gray-600 dark:text-gray-400">{blockedReason}</p>
                        </div>
                    </div>
                </div>

                {/* System Info */}
                <div className="space-y-3 mb-6">
                    <h3 className="font-bold text-sm text-gray-900 dark:text-gray-100 mb-3">System Information</h3>
                    
                    <DiagnosticRow label="Browser" value={browser} good={['Chrome', 'Edge', 'Samsung Internet', 'Firefox'].includes(browser)} />
                    <DiagnosticRow label="Platform" value={platform} good={true} />
                    <DiagnosticRow label="HTTPS" value={isHTTPS ? 'Yes' : 'No'} good={isHTTPS} />
                    <DiagnosticRow label="Service Worker Support" value={swSupported ? 'Yes' : 'No'} good={swSupported} />
                    <DiagnosticRow label="Service Worker Registered" value={swRegistered ? 'Yes' : 'No'} good={swRegistered} />
                    <DiagnosticRow label="Manifest Found" value={manifestFound ? 'Yes' : 'No'} good={manifestFound} />
                    <DiagnosticRow label="Install Prompt Available" value={supportsPrompt ? 'Yes' : 'No'} good={supportsPrompt} />
                </div>

                {/* Recommendations */}
                <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4">
                    <h3 className="font-bold text-sm text-gray-900 dark:text-gray-100 mb-3">💡 What To Do</h3>
                    {getRecommendations(diagnostics).map((rec, i) => (
                        <div key={i} className="flex items-start gap-2 mb-2 last:mb-0">
                            <span className="text-sm mt-0.5">{rec.icon}</span>
                            <p className="text-sm text-gray-600 dark:text-gray-400">{rec.text}</p>
                        </div>
                    ))}
                </div>

                {/* Manual Instructions */}
                {platform === 'iOS' && browser === 'Safari' && (
                    <div className="mt-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
                        <h3 className="font-bold text-sm text-gray-900 dark:text-gray-100 mb-2">📱 iOS Safari Manual Install</h3>
                        <ol className="text-sm text-gray-600 dark:text-gray-400 space-y-1 list-decimal list-inside">
                            <li>Tap the Share button (⬆️) at the bottom</li>
                            <li>Scroll down and tap "Add to Home Screen"</li>
                            <li>Tap "Add" in the top right</li>
                            <li>App icon will appear on your home screen</li>
                        </ol>
                    </div>
                )}
            </div>
        </div>
    );
}

function DiagnosticRow({ label, value, good }) {
    return (
        <div className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</span>
            <span className={`text-sm font-bold ${good ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {good ? '✓' : '✗'} {value}
            </span>
        </div>
    );
}

function getRecommendations(diagnostics) {
    const recommendations = [];

    if (diagnostics.isInstalled) {
        recommendations.push({ icon: '✅', text: 'App is already installed! Open it from your home screen or app drawer.' });
        return recommendations;
    }

    if (diagnostics.supportsPrompt) {
        recommendations.push({ icon: '🎉', text: 'Your browser is ready to install! Click the "Install" button or look for the install icon (⊕) in your address bar.' });
        return recommendations;
    }

    if (!diagnostics.isHTTPS) {
        recommendations.push({ icon: '🔒', text: 'Deploy to HTTPS (Vercel, Netlify, etc.) for PWA support. Localhost works for testing.' });
    }

    if (!diagnostics.swRegistered) {
        recommendations.push({ icon: '⚙️', text: 'Service worker failed to register. Check browser console for errors.' });
    }

    if (!diagnostics.manifestFound) {
        recommendations.push({ icon: '📄', text: 'Manifest file not found. Check that /manifest.json exists and is linked in HTML.' });
    }

    if (diagnostics.platform === 'iOS' && diagnostics.browser === 'Safari') {
        recommendations.push({ icon: '🍎', text: 'iOS Safari requires manual installation - see instructions below.' });
    } else if (diagnostics.browser === 'Safari') {
        recommendations.push({ icon: '🌐', text: 'Try Chrome, Edge, or Firefox for better PWA support.' });
    } else if (diagnostics.blockedReason?.includes('cooldown')) {
        recommendations.push({ icon: '⏰', text: 'Browser cooldown active. Try: Different browser, incognito mode, or wait 24-48 hours.' });
    } else {
        recommendations.push({ icon: '🔄', text: 'Try: Different browser, clear site data, incognito mode, or wait 24-48 hours if recently uninstalled.' });
    }

    return recommendations;
}
