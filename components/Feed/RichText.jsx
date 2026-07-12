"use client";

/**
 * Renders post/comment text with:
 * - #hashtag → blue clickable tag (calls onHashtag)
 * - @mention → bold blue text
 */
export default function RichText({ text, onHashtag, className = "" }) {
    if (!text) return null;

    // Split on hashtags and mentions
    const parts = text.split(/(#[a-zA-Z0-9_]+|@[a-zA-Z0-9_]+)/g);

    return (
        <span className={className}>
            {parts.map((part, i) => {
                if (/^#[a-zA-Z0-9_]+$/.test(part)) {
                    const tag = part.slice(1).toLowerCase();
                    return (
                        <button
                            key={i}
                            onClick={() => onHashtag?.(tag)}
                            className="text-blue-500 hover:text-blue-600 hover:underline font-medium"
                        >
                            {part}
                        </button>
                    );
                }
                if (/^@[a-zA-Z0-9_]+$/.test(part)) {
                    return (
                        <span key={i} className="text-blue-500 font-semibold">
                            {part}
                        </span>
                    );
                }
                return <span key={i}>{part}</span>;
            })}
        </span>
    );
}
