"use client";

export default function HangmanFigure({ wrong }) {
    const s = { stroke: "currentColor", strokeWidth: 4, strokeLinecap: "round", fill: "none" };
    return (
        <svg viewBox="0 0 200 220" className="w-40 h-44 text-gray-700 dark:text-gray-300">
            <line x1="20" y1="210" x2="120" y2="210" {...s} />
            <line x1="60" y1="210" x2="60" y2="20" {...s} />
            <line x1="60" y1="20" x2="140" y2="20" {...s} />
            <line x1="140" y1="20" x2="140" y2="50" {...s} />
            {wrong > 0 && <circle cx="140" cy="70" r="20" {...s} />}
            {wrong > 1 && <line x1="140" y1="90" x2="140" y2="150" {...s} />}
            {wrong > 2 && <line x1="140" y1="105" x2="115" y2="130" {...s} />}
            {wrong > 3 && <line x1="140" y1="105" x2="165" y2="130" {...s} />}
            {wrong > 4 && <line x1="140" y1="150" x2="115" y2="185" {...s} />}
            {wrong > 5 && <line x1="140" y1="150" x2="165" y2="185" {...s} />}
        </svg>
    );
}
