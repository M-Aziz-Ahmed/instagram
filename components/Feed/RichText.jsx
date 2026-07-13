"use client";

import Link from "next/link";

export default function RichText({ text, onHashtag, className = "" }) {
    if (!text) return null;

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
                    const username = part.slice(1);
                    return (
                        <Link
                            key={i}
                            href={`/profile/${encodeURIComponent(username)}`}
                            className="text-blue-500 font-semibold hover:underline"
                        >
                            {part}
                        </Link>
                    );
                }
                return <span key={i}>{part}</span>;
            })}
        </span>
    );
}
