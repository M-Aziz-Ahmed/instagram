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
        <div className="w-full bg-white shadow flex flex-col justify-between items-center h-screen py-6 px-3">
            <div className="flex-1 w-full overflow-y-auto mb-4">
                <Chat refreshTrigger={refreshTrigger} />
            </div>
            <div className="w-full">
                <Input onMessageSent={handleMessageSent} />
            </div>
        </div>
    );
};

export default ChatBox;
