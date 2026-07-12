import ChatBox from "@/components/Inbox/ChatBox";

export default function InboxPage() {
    return (
        <div className="flex h-screen bg-white">
            {/* Left sidebar */}
            <aside className="w-80 border-r border-gray-200 flex flex-col shrink-0">
                {/* Sidebar header */}
                <div className="px-6 py-5 border-b border-gray-200 flex items-center justify-between">
                    <span className="font-semibold text-base tracking-tight">Messages</span>
                    <button
                        aria-label="New message"
                        className="text-gray-900 hover:text-gray-500 transition-colors"
                    >
                        {/* Pencil / compose icon */}
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
                            strokeWidth={1.8} stroke="currentColor" className="w-6 h-6">
                            <path strokeLinecap="round" strokeLinejoin="round"
                                d="M16.862 3.487a2.25 2.25 0 1 1 3.182 3.182L7.5 19.213l-4.5 1.125 1.125-4.5L16.862 3.487z" />
                        </svg>
                    </button>
                </div>

                {/* Conversation list */}
                <div className="flex-1 overflow-y-auto">
                    {/* Active conversation */}
                    <button className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors bg-gray-50">
                        <div className="relative shrink-0">
                            <div className="w-14 h-14 rounded-full bg-linear-to-br from-purple-400 via-pink-400 to-orange-400 flex items-center justify-center text-white font-semibold text-lg select-none">
                                A
                            </div>
                            <span className="absolute bottom-0.5 right-0.5 w-3 h-3 bg-green-400 rounded-full border-2 border-white" />
                        </div>
                        <div className="flex-1 min-w-0 text-left">
                            <p className="font-medium text-sm text-gray-900 truncate">azizahmed1</p>
                            <p className="text-xs text-gray-500 truncate">You · Active now</p>
                        </div>
                    </button>
                </div>
            </aside>

            {/* Main chat area */}
            <main className="flex-1 flex flex-col min-w-0">
                <ChatBox />
            </main>
        </div>
    );
}
