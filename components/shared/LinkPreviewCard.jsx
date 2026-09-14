"use client";

const MAX_TITLE_CHARS = 140;
const MAX_DESC_CHARS = 200;

export default function LinkPreviewCard({ preview, small = false }) {
    if (!preview || typeof preview !== "object") return null;

    const title = String(preview.title || preview.domain || "View link").slice(0, MAX_TITLE_CHARS);
    const description = String(preview.description || "").slice(0, MAX_DESC_CHARS);
    const image = preview.image || "";
    const domain = preview.domain || (() => { try { return new URL(preview.url).hostname.replace(/^www\./, ""); } catch { return ""; } })();
    const favicon = preview.favicon || "";
    const href = preview.url || "#";

    return (
        <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className={`block max-w-full overflow-hidden rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 hover:border-blue-400 dark:hover:border-blue-500 shadow-sm transition-colors ${small ? "" : "min-w-[240px]"}`}
        >
            {image && (
                <div className="w-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                    <img src={image} alt="" className="w-full h-32 object-cover" loading="lazy" />
                </div>
            )}
            <div className="px-3 py-2">
                <p className={`font-semibold text-gray-900 dark:text-gray-100 ${small ? "text-xs" : "text-sm"} leading-snug line-clamp-2`}>{title}</p>
                {description && (
                    <p className={`text-gray-500 dark:text-gray-400 ${small ? "text-[10px]" : "text-xs"} mt-0.5 leading-snug line-clamp-2`}>{description}</p>
                )}
                <p className={`flex items-center gap-1.5 mt-1.5 text-gray-400 dark:text-gray-500 ${small ? "text-[10px]" : "text-[11px]"} truncate`}>
                    {favicon && (
                        <img src={favicon} alt="" className="w-3.5 h-3.5 rounded-sm shrink-0" loading="lazy" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                    )}
                    <span className="truncate">{domain}</span>
                </p>
            </div>
        </a>
    );
}