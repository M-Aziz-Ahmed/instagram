"use client";

import Link from "next/link";

export default function GuestPrompt({ action = "interact", className = "" }) {
    return (
        <div className={`flex flex-col items-center justify-center py-8 px-6 text-center ${className}`}>
            <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 text-gray-400 dark:text-gray-500">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                </svg>
            </div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1">
                Sign in to {action}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 max-w-[240px]">
                Join the community to like, comment, post, and connect with others.
            </p>
            <Link
                href="/login"
                className="bg-blue-500 hover:bg-blue-600 text-white text-sm font-bold px-6 py-2 rounded-full transition-colors"
            >
                Sign In
            </Link>
        </div>
    );
}

export function LoginModal({ onClose, action = "interact" }) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white dark:bg-gray-950 rounded-2xl p-6 w-full max-w-sm mx-4 shadow-2xl text-center" onClick={e => e.stopPropagation()}>
                <div className="w-14 h-14 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mx-auto mb-4">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-7 h-7 text-gray-400 dark:text-gray-500">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                    </svg>
                </div>
                <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-1">
                    Sign in to {action}
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
                    Join AnonTweet to like, comment, post, and connect.
                </p>
                <Link
                    href="/login"
                    className="block w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-2.5 rounded-xl transition-colors text-sm"
                >
                    Sign In
                </Link>
                <button
                    onClick={onClose}
                    className="mt-3 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                >
                    Not now
                </button>
            </div>
        </div>
    );
}
