const STORAGE_KEY = "active_chat_username";
let _activeChat = null;
let _channel = null;

function getChannel() {
    if (typeof window !== "undefined" && !_channel) {
        try { _channel = new BroadcastChannel("active_chat"); } catch {}
    }
    return _channel;
}

export function setActiveChat(username) {
    _activeChat = username || null;
    if (typeof window !== "undefined") {
        if (_activeChat) {
            localStorage.setItem(STORAGE_KEY, _activeChat);
        } else {
            localStorage.removeItem(STORAGE_KEY);
        }
        try { getChannel()?.postMessage(_activeChat); } catch {}
    }
}

export function getActiveChat() {
    if (typeof window !== "undefined" && _activeChat === null) {
        return localStorage.getItem(STORAGE_KEY);
    }
    return _activeChat;
}
