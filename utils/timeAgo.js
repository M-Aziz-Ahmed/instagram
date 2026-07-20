export function timeAgo(date) {
    const diff = (Date.now() - new Date(date)) / 1000;
    if (diff < 60)    return `${Math.floor(diff)}s`;
    if (diff < 3600)  return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    return new Date(date).toLocaleDateString([], { month: "short", day: "numeric" });
}
