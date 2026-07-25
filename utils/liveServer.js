export function getLiveServerUrl() {
    if (typeof window === "undefined") return "";
    return window.location.origin;
}

export function getSocketUrl() {
    if (typeof window === "undefined") return "";
    return window.location.origin;
}
