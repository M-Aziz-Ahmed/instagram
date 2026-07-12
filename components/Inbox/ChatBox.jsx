"use client";

import { useState } from "react";
import Chat from "./Chat";
import Input from "./Input";

const ChatBox = () => {
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    const handleMessageSent = () => {
        setRefreshTrigger((prev) => prev + 1);
    };

    return (
        <div className="flex flex-col h-full">
            {/* Chat header */}
            <header className="flex items-center gap-3 px-6 py-4 border-b border-gray-200 shrink-0">
                <div className="relative shrink-0">
                    <div className="w-10 h-10 rounded-full bg-linear-to-br from-purple-400 via-pink-400 to-orange-400 flex items-center justify-center text-white font-semibold select-none">
                        A
                    </div>
                    <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-400 rounded-full border-2 border-white" />
                </div>
                <div>
                    <p className="font-semibold text-sm text-gray-900">azizahmed1</p>
                    <p className="text-xs text-green-500">Active now</p>
                </div>

                {/* Header actions */}
                <div className="ml-auto flex items-center gap-4 text-gray-900">
                    <button aria-label="Voice call" className="hover:text-gray-500 transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
                            strokeWidth={1.8} stroke="currentColor" className="w-6 h-6">
                            <path strokeLinecap="round" strokeLinejoin="round"
                                d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25z" />
                        </svg>
                    </button>
                    <button aria-label="Video call" className="hover:text-gray-500 transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
                            strokeWidth={1.8} stroke="currentColor" className="w-6 h-6">
                            <path strokeLinecap="round" strokeLinejoin="round"
                                d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25z" />
                        </svg>
                    </button>
                    <button aria-label="Info" className="hover:text-gray-500 transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
                            strokeWidth={1.8} stroke="currentColor" className="w-6 h-6">
                            <path strokeLinecap="round" strokeLinejoin="round"
                                d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0zm-9-3.75h.008v.008H12V8.25z" />
                        </svg>
                    </button>
                </div>
            </header>

            {/* Messages area */}
            <div className="flex-1 overflow-y-auto px-4 py-4">
                <Chat refreshTrigger={refreshTrigger} />
            </div>

            {/* Input bar */}
            <div className="px-4 py-3 border-t border-gray-200 shrink-0">
                <Input onMessageSent={handleMessageSent} />
            </div>
        </div>
    );
};

export default ChatBox;
