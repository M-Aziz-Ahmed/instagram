"use client";

const PIECES = {
    wK: (
        <svg viewBox="0 0 45 45" xmlns="http://www.w3.org/2000/svg">
            <g fill="none" fillRule="evenodd" stroke="#000" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22.5 11.63V6M20 8h5" strokeLinejoin="miter"/>
                <path d="M22.5 25s4.5-7.5 3-10.5c0 0-1-2.5-3-2.5s-3 2.5-3 2.5c-1.5 3 3 10.5 3 10.5" fill="#fff" strokeLinecap="butt" strokeLinejoin="miter"/>
                <path d="M11.5 37c5.5 3.5 15.5 3.5 21 0v-7s9-4.5 6-10.5c-4-6.5-13.5-3.5-16 4V27v-3.5c-3.5-7.5-13-10.5-16-4-3 6 5 10.5 5 10.5V37z" fill="#fff"/>
                <path d="M11.5 30c5.5-3 15.5-3 21 0M11.5 33.5c5.5-3 15.5-3 21 0M11.5 37c5.5-3 15.5-3 21 0"/>
            </g>
        </svg>
    ),
    wQ: (
        <svg viewBox="0 0 45 45" xmlns="http://www.w3.org/2000/svg">
            <g fill="#fff" fillRule="evenodd" stroke="#000" strokeWidth="1.5" strokeLinejoin="round">
                <path d="M9 26c8.5-1.5 21-1.5 27 0l2-12-7 11V11l-5.5 13.5-3-15-3 15-5.5-14V25L6 14l3 12z" strokeLinecap="butt"/>
                <path d="M9 26c0 2 1.5 2 2.5 4 1 1.5 1 1 .5 3.5-1.5 1-1.5 2.5-1.5 2.5-1.5 1.5.5 2.5.5 2.5 6.5 1 16.5 1 23 0 0 0 1.5-1 0-2.5 0 0 .5-1.5-1-2.5-.5-2.5-.5-2 .5-3.5 1-2 2.5-2 2.5-4-8.5-1.5-18.5-1.5-27 0z" strokeLinecap="butt"/>
                <path d="M11.5 30c3.5-1 18.5-1 22 0M12 33.5c6-1 15-1 21 0" fill="none"/>
                <circle cx="6" cy="12" r="2"/>
                <circle cx="14" cy="9" r="2"/>
                <circle cx="22.5" cy="8" r="2"/>
                <circle cx="31" cy="9" r="2"/>
                <circle cx="39" cy="12" r="2"/>
            </g>
        </svg>
    ),
    wR: (
        <svg viewBox="0 0 45 45" xmlns="http://www.w3.org/2000/svg">
            <g fill="#fff" fillRule="evenodd" stroke="#000" strokeWidth="1.5" strokeLinejoin="round">
                <path d="M9 39h27v-3H9v3zM12 36v-4h21v4H12zM11 14V9h4v2h5V9h5v2h5V9h4v5" strokeLinecap="butt"/>
                <path d="M34 14l-3 3H14l-3-3"/>
                <path d="M15 17v5h15v-5" strokeLinecap="butt" strokeLinejoin="miter"/>
                <path d="M14 29.5v-13h17v13H14z" strokeLinecap="butt" strokeLinejoin="miter"/>
                <path d="M14 29.5L11 36h23l-3-6.5H14z" strokeLinecap="butt" strokeLinejoin="miter"/>
            </g>
        </svg>
    ),
    wB: (
        <svg viewBox="0 0 45 45" xmlns="http://www.w3.org/2000/svg">
            <g fill="none" fillRule="evenodd" stroke="#000" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <g fillRule="nonzero">
                    <path d="M9 36c3.39-.97 10.11.43 13.5-2 3.39 2.43 10.11 1.03 13.5 2 0 0 1.65.54 3 2-.68.97-1.65.99-3 .5-3.39-.97-10.11.46-13.5-1-3.39 1.46-10.11.03-13.5 1-1.354.49-2.323.47-3-.5 1.354-1.94 3-2 3-2z" fill="#fff"/>
                    <path d="M15 32c2.5 2.5 12.5 2.5 15 0 .5-1.5 0-2 0-2 0-2.5-2.5-4-2.5-4 5.5-1.5 6-11.5-5-15.5-11 4-10.5 14-5 15.5 0 0-2.5 1.5-2.5 4 0 0-.5.5 0 2z" fill="#fff"/>
                    <path d="M25 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 1 1 5 0z"/>
                </g>
                <path d="M17.5 26h10M15 30h15m-2.5-14.5v5M20 18h5" strokeLinejoin="miter"/>
            </g>
        </svg>
    ),
    wN: (
        <svg viewBox="0 0 45 45" xmlns="http://www.w3.org/2000/svg">
            <g fill="none" fillRule="evenodd" stroke="#000" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21" fill="#fff"/>
                <path d="M24 18c.38 2.91-5.55 7.37-8 9-3 2-2.82 4.34-5 4-1.042-.94 1.41-3.04 0-3-1 0 .19 1.23-1 2-1 0-4.003 1-4-4 0-2 6-12 6-12s1.89-1.9 2-3.5c-.73-.994-.5-2-.5-3 1-1 3 2.5 3 2.5h2s.78-1.992 2.5-3c1 0 1 3 1 3" fill="#fff"/>
                <path d="M9.5 25.5a.5.5 0 1 1-1 0 .5.5 0 1 1 1 0z" fill="#000"/>
                <path d="M14.933 15.75a.5 1.5 30 1 1-.866-.5.5 1.5 30 1 1 .866.5z" fill="#000"/>
            </g>
        </svg>
    ),
    wP: (
        <svg viewBox="0 0 45 45" xmlns="http://www.w3.org/2000/svg">
            <path d="M22.5 9c-2.21 0-4 1.79-4 4 0 .89.29 1.71.78 2.38C17.33 16.5 16 18.59 16 21c0 2.03.94 3.84 2.41 5.03C15.41 27.09 11 31.58 11 39h23c0-7.42-4.41-11.91-7.41-12.97C28.06 24.84 29 23.03 29 21c0-2.41-1.33-4.5-3.28-5.62.49-.67.78-1.49.78-2.38 0-2.21-1.79-4-4-4z" fill="#fff" stroke="#000" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
    ),
    bK: (
        <svg viewBox="0 0 45 45" xmlns="http://www.w3.org/2000/svg">
            <g fill="none" fillRule="evenodd" stroke="#000" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22.5 11.63V6M20 8h5" strokeLinejoin="miter"/>
                <path d="M22.5 25s4.5-7.5 3-10.5c0 0-1-2.5-3-2.5s-3 2.5-3 2.5c-1.5 3 3 10.5 3 10.5" fill="#000" strokeLinecap="butt" strokeLinejoin="miter"/>
                <path d="M11.5 37c5.5 3.5 15.5 3.5 21 0v-7s9-4.5 6-10.5c-4-6.5-13.5-3.5-16 4V27v-3.5c-3.5-7.5-13-10.5-16-4-3 6 5 10.5 5 10.5V37z" fill="#000"/>
                <path d="M11.5 30c5.5-3 15.5-3 21 0M11.5 33.5c5.5-3 15.5-3 21 0M11.5 37c5.5-3 15.5-3 21 0" stroke="#fff"/>
            </g>
        </svg>
    ),
    bQ: (
        <svg viewBox="0 0 45 45" xmlns="http://www.w3.org/2000/svg">
            <g fill="#000" fillRule="evenodd" stroke="#000" strokeWidth="1.5" strokeLinejoin="round">
                <path d="M9 26c8.5-1.5 21-1.5 27 0l2-12-7 11V11l-5.5 13.5-3-15-3 15-5.5-14V25L6 14l3 12z" strokeLinecap="butt"/>
                <path d="M9 26c0 2 1.5 2 2.5 4 1 1.5 1 1 .5 3.5-1.5 1-1.5 2.5-1.5 2.5-1.5 1.5.5 2.5.5 2.5 6.5 1 16.5 1 23 0 0 0 1.5-1 0-2.5 0 0 .5-1.5-1-2.5-.5-2.5-.5-2 .5-3.5 1-2 2.5-2 2.5-4-8.5-1.5-18.5-1.5-27 0z" strokeLinecap="butt"/>
                <path d="M11.5 30c3.5-1 18.5-1 22 0M12 33.5c6-1 15-1 21 0" fill="none" stroke="#fff"/>
                <circle cx="6" cy="12" r="2" fill="#fff" stroke="#000"/>
                <circle cx="14" cy="9" r="2" fill="#fff" stroke="#000"/>
                <circle cx="22.5" cy="8" r="2" fill="#fff" stroke="#000"/>
                <circle cx="31" cy="9" r="2" fill="#fff" stroke="#000"/>
                <circle cx="39" cy="12" r="2" fill="#fff" stroke="#000"/>
            </g>
        </svg>
    ),
    bR: (
        <svg viewBox="0 0 45 45" xmlns="http://www.w3.org/2000/svg">
            <g fillRule="evenodd" xmlns="http://www.w3.org/2000/svg">
                <path d="M9 39h27v-3H9v3zM12 36v-4h21v4H12zM11 14V9h4v2h5V9h5v2h5V9h4v5" stroke="#000" strokeWidth="1.5" strokeLinecap="butt"/>
                <path d="M34 14l-3 3H14l-3-3" stroke="#000" strokeWidth="1.5"/>
                <path d="M15 17v5h15v-5" fill="#000" stroke="#000" strokeWidth="1.5" strokeLinecap="butt" strokeLinejoin="miter"/>
                <path d="M14 29.5v-13h17v13H14z" fill="#000" stroke="#000" strokeWidth="1.5" strokeLinecap="butt" strokeLinejoin="miter"/>
                <path d="M14 29.5L11 36h23l-3-6.5H14z" fill="#000" stroke="#000" strokeWidth="1.5" strokeLinecap="butt" strokeLinejoin="miter"/>
                <path d="M11 14l2.5-2.5M11 9.5L14 7M34 14l-2.5-2.5M34 9.5L31 7" stroke="#fff" strokeWidth="1" strokeLinecap="butt"/>
            </g>
        </svg>
    ),
    bB: (
        <svg viewBox="0 0 45 45" xmlns="http://www.w3.org/2000/svg">
            <g fill="none" fillRule="evenodd" stroke="#000" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <g fillRule="nonzero">
                    <path d="M9 36c3.39-.97 10.11.43 13.5-2 3.39 2.43 10.11 1.03 13.5 2 0 0 1.65.54 3 2-.68.97-1.65.99-3 .5-3.39-.97-10.11.46-13.5-1-3.39 1.46-10.11.03-13.5 1-1.354.49-2.323.47-3-.5 1.354-1.94 3-2 3-2z" fill="#000"/>
                    <path d="M15 32c2.5 2.5 12.5 2.5 15 0 .5-1.5 0-2 0-2 0-2.5-2.5-4-2.5-4 5.5-1.5 6-11.5-5-15.5-11 4-10.5 14-5 15.5 0 0-2.5 1.5-2.5 4 0 0-.5.5 0 2z" fill="#000"/>
                    <path d="M25 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 1 1 5 0z" fill="#fff" stroke="#000"/>
                </g>
                <path d="M17.5 26h10M15 30h15m-2.5-14.5v5M20 18h5" stroke="#fff" strokeLinejoin="miter"/>
            </g>
        </svg>
    ),
    bN: (
        <svg viewBox="0 0 45 45" xmlns="http://www.w3.org/2000/svg">
            <g fill="none" fillRule="evenodd" stroke="#000" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21" fill="#000"/>
                <path d="M24 18c.38 2.91-5.55 7.37-8 9-3 2-2.82 4.34-5 4-1.042-.94 1.41-3.04 0-3-1 0 .19 1.23-1 2-1 0-4.003 1-4-4 0-2 6-12 6-12s1.89-1.9 2-3.5c-.73-.994-.5-2-.5-3 1-1 3 2.5 3 2.5h2s.78-1.992 2.5-3c1 0 1 3 1 3" fill="#000"/>
                <path d="M9.5 25.5a.5.5 0 1 1-1 0 .5.5 0 1 1 1 0z" fill="#fff"/>
                <path d="M14.933 15.75a.5 1.5 30 1 1-.866-.5.5 1.5 30 1 1 .866.5z" fill="#fff"/>
            </g>
        </svg>
    ),
    bP: (
        <svg viewBox="0 0 45 45" xmlns="http://www.w3.org/2000/svg">
            <path d="M22.5 9c-2.21 0-4 1.79-4 4 0 .89.29 1.71.78 2.38C17.33 16.5 16 18.59 16 21c0 2.03.94 3.84 2.41 5.03C15.41 27.09 11 31.58 11 39h23c0-7.42-4.41-11.91-7.41-12.97C28.06 24.84 29 23.03 29 21c0-2.41-1.33-4.5-3.28-5.62.49-.67.78-1.49.78-2.38 0-2.21-1.79-4-4-4z" fill="#000" stroke="#000" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
    ),
};

const PIECE_MAP = {
    p: "P", n: "N", b: "B", r: "R", q: "Q", k: "K",
};

export default function ChessPiece({ piece, size = 45 }) {
    if (!piece) return null;
    const color = piece.color === "w" ? "w" : "b";
    const key = color + PIECE_MAP[piece.type];
    const svg = PIECES[key];
    if (!svg) return null;

    return (
        <div style={{ width: size, height: size }} className="pointer-events-none select-none">
            {svg}
        </div>
    );
}

export { PIECES };
