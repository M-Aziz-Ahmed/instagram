"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";

const CATEGORIES = [
    { id: "recent", label: "🕐", name: "Recently Used" },
    { id: "smileys", label: "😀", name: "Smileys & People" },
    { id: "gestures", label: "👋", name: "Gestures & People" },
    { id: "nature", label: "🐶", name: "Animals & Nature" },
    { id: "food", label: "🍔", name: "Food & Drink" },
    { id: "activities", label: "⚽", name: "Activities" },
    { id: "travel", label: "🚗", name: "Travel & Places" },
    { id: "objects", label: "💡", name: "Objects" },
    { id: "symbols", label: "💕", name: "Symbols" },
    { id: "flags", label: "🏳️", name: "Flags" },
];

const EMOJI_DATA = {
    smileys: [
        "😀","😃","😄","😁","😆","😅","🤣","😂","🙂","😊","😇","🥰","😍","🤩","😘","😗","😚","😙","🥲","😋",
        "😛","😜","🤪","😝","🤑","🤗","🤭","🫢","🫣","🤫","🤔","🫡","🤐","🤨","😐","😑","😶","🫥","😏","😒",
        "🙄","😬","🤥","😌","😔","😪","🤤","😴","😷","🤒","🤕","🤢","🤮","🥵","🥶","🥴","😵","🤯","🤠","🥳",
        "🥸","😎","🤓","🧐","😕","🫤","😟","🙁","😮","😯","😲","😳","🥺","🥹","😦","😧","😨","😰","😥","😢",
        "😭","😱","😖","😣","😞","😓","😩","😫","🥱","😤","😡","😠","🤬","😈","👿","💀","☠️","💩","🤡","👹",
        "👺","👻","👽","👾","🤖","😺","😸","😹","😻","😼","😽","🙀","😿","😾","🫶","❤️‍🔥","💋","💌","💘","💝",
    ],
    gestures: [
        "👋","🤚","🖐️","✋","🖖","🫱","🫲","🫳","🫴","🫷","🫸","👌","🤌","🤏","✌️","🤞","🫰","🤟","🤘","🤙",
        "👈","👉","👆","🖕","👇","☝️","🫵","👍","👎","✊","👊","🤛","🤜","👏","🙌","🫶","👐","🤲","🤝","🙏",
        "✍️","💅","🤳","💪","🦾","🦿","🦵","🦶","👂","🦻","👃","🧠","🫀","🫁","🦷","🦴","👀","👁️","👅","👄",
    ],
    nature: [
        "🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐻‍❄️","🐨","🐯","🦁","🐮","🐷","🐸","🐵","🙈","🙉","🙊","🐒",
        "🐔","🐧","🐦","🐤","🐣","🐥","🦆","🦅","🦉","🦇","🐺","🐗","🐴","🦄","🐝","🪱","🐛","🦋","🐌","🐞",
        "🐜","🪰","🪲","🪳","🦟","🦗","🕷️","🦂","🐢","🐍","🦎","🦖","🦕","🐙","🦑","🦐","🦞","🦀","🐡","🐠",
        "🐟","🐬","🐳","🐋","🦈","🐊","🐅","🐆","🦓","🦍","🦧","🐘","🦣","🦛","🦏","🐪","🐫","🦒","🦘","🦬",
        "🌸","💐","🌷","🌹","🥀","🌺","🌻","🌼","🍀","🌿","☘️","🌱","🌲","🌳","🌴","🌵","🌾","🍂","🍁","🍃",
    ],
    food: [
        "🍇","🍈","🍉","🍊","🍋","🍌","🍍","🥭","🍎","🍏","🍐","🍑","🍒","🍓","🫐","🥝","🍅","🫒","🥥","🥑",
        "🍆","🥔","🥕","🌽","🌶️","🫑","🥒","🥬","🥦","🧄","🧅","🍄","🥜","🫘","🌰","🍞","🥐","🥖","🫓","🥨",
        "🥯","🥞","🧇","🧀","🍖","🍗","🥩","🥓","🍔","🍟","🍕","🌭","🥪","🌮","🌯","🫔","🥙","🧆","🥚","🍳",
        "🥘","🍲","🫕","🥣","🥗","🍿","🧈","🧂","🥫","🍱","🍘","🍙","🍚","🍛","🍜","🍝","🍠","🍢","🍣","🍤",
        "🍥","🥮","🍡","🥟","🥠","🥡","🦀","🦞","🦐","🦑","🦪","🍦","🍧","🍨","🍩","🍪","🎂","🍰","🧁","🥧",
        "🍫","🍬","🍭","🍮","☕","🫖","🍵","🍶","🍾","🍷","🍸","🍹","🍺","🍻","🥂","🥃","🫗","🥤","🧋","🧃",
    ],
    activities: [
        "⚽","🏀","🏈","⚾","🥎","🎾","🏐","🏉","🥏","🎱","🪀","🏓","🏸","🏒","🏑","🥍","🏏","🪃","🥅","⛳",
        "🪁","🏹","🎣","🤿","🥊","🥋","🎽","🛹","🛼","🛷","⛸️","🥌","🎿","🪂","🎮","🕹️","🎲","🧩","♟️","🎭",
        "🎨","🧵","🪡","🧶","🎪","🎬","🎤","🎧","🎼","🎹","🥁","🪘","🎷","🎺","🪗","🎸","🪕","🎻","🏆","🥇",
        "🥈","🥉","🏅","🎖️","🏵️","🎗️","🎫","🎟️","🎪","🤹","🪄","🪅","🎨","🪆","🎯","🎳","🎰","🎲",
    ],
    travel: [
        "🚗","🚕","🚙","🚌","🚎","🏎️","🚓","🚑","🚒","🚐","🛻","🚚","🚛","🚜","🏍️","🛵","🦽","🦼","🛺","🚲",
        "🛴","🛹","🛼","🚏","🛣️","🛤️","🛞","⛽","🛞","🚨","🚥","🚦","🛑","🚧","⚓","🛟","⛵","🛶","🚤","🛳️",
        "⛴️","🛥️","🚢","✈️","🛩️","🛫","🛬","🪂","💺","🚁","🚟","🚠","🚡","🛰️","🚀","🛸","🌍","🌎","🌏","🗺️",
        "🏔️","⛰️","🌋","🗻","🏕️","🏖️","🏜️","🏝️","🏞️","🏟️","🏛️","🏗️","🧱","🪨","🪵","🛖","🏘️","🏚️","🏭","🏢",
        "🏬","🏣","🏤","🏥","🏦","🏨","🏪","🏫","🏩","💒","🗼","🗽","⛪","🕌","🛕","🕍","⛩️","🕋","⛲","⛺",
    ],
    objects: [
        "💡","🔦","🕯️","🪔","📱","💻","⌨️","🖥️","🖨️","🖱️","🖲️","💾","💿","📀","📷","📸","📹","🎥","📽️","🎞️",
        "📞","☎️","📟","📠","📺","📻","🎙️","🎚️","🎛️","🧭","⏱️","⏲️","⏰","🕰️","📡","🔋","🔌","🪜","🧰","🪛",
        "🔧","🔨","⚒️","🛠️","⛏️","🪚","🔩","⚙️","🪤","🧱","⛓️","🧲","🔫","💣","🧨","🪓","🔪","🗡️","⚔️","🛡️",
        "🚬","⚰️","🪦","⚱️","🏺","🔮","📿","🧿","🪬","💈","⚗️","🔭","🔬","🕳️","🩹","🩺","🩻","🩼","💊","💉",
        "🩸","🧬","🦠","🧫","🧪","🌡️","🧹","🪠","🧺","🧻","🚽","🚰","🚿","🛁","🛀","🧼","🫧","🪥","🪒","🧽",
        "🪣","🧴","🔑","🗝️","🚪","🛋️","🪑","🛏️","🛌","🧸","🪆","🖼️","🪞","🪟","🛍️","🛒","🎁","🎈","🎏","🪅",
    ],
    symbols: [
        "❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔","❤️‍🔥","❤️‍🩹","❣️","💕","💞","💓","💗","💖","💘","💝",
        "⭐","🌟","💫","✨","⚡","🔥","💥","❄️","🌈","☀️","🌤️","⛅","🌥️","☁️","🌧️","⛈️","🌩️","🌪️","🌫️","☃️",
        "💯","✅","☑️","✔️","❌","❎","➕","➖","➗","✖️","♾️","❓","❔","❕","❗","‼️","⁉️","💲","⚕️","♻️","⚜️",
        "🔱","📛","🔰","⭕","✅","🏁","🚩","🎌","🏴","🏳️","🏳️‍🌈","🏳️‍⚧️","🏴‍☠️","🇦","🇧","🇨","🇩","🇪","🇫","🇬","🇭",
        "☮️","✝️","☪️","🕉️","☸️","✡️","🔯","🕎","☯️","☦️","🛐","⛎","♈","♉","♊","♋","♌","♍","♎","♏",
    ],
    flags: [
        "🏁","🚩","🎌","🏴","🏳️","🏳️‍🌈","🏳️‍⚧️","🏴‍☠️","🇺🇸","🇬🇧","🇫🇷","🇩🇪","🇮🇹","🇪🇸","🇵🇹","🇧🇷","🇯🇵","🇰🇷","🇨🇳","🇮🇳",
        "🇷🇺","🇨🇦","🇦🇺","🇲🇽","🇦🇷","🇹🇷","🇸🇦","🇦🇪","🇮🇱","🇪🇬","🇿🇦","🇳🇬","🇰🇪","🇹🇭","🇻🇳","🇮🇩","🇵🇭","🇲🇾","🇸🇬","🇳🇿",
    ],
};

const SKIN_TONES = ["", "🏻", "🏼", "🏽", "🏾", "🏿"];
const SKIN_TONE_LABELS = ["Default", "Light", "Medium-Light", "Medium", "Medium-Dark", "Dark"];

const STORAGE_KEY = "anon-emoji-recent";

function getRecentEmojis() {
    if (typeof window === "undefined") return [];
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    } catch { return []; }
}

function addRecentEmoji(emoji) {
    if (typeof window === "undefined") return;
    const recent = getRecentEmojis().filter(e => e !== emoji);
    recent.unshift(emoji);
    if (recent.length > 30) recent.length = 30;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(recent));
}

export default function EmojiPicker({ onEmojiSelect, onClose, className = "" }) {
    const [search, setSearch]       = useState("");
    const [activeCategory, setActiveCategory] = useState("recent");
    const [skinTone, setSkinTone]   = useState(0);
    const [showSkinTones, setShowSkinTones] = useState(false);
    const searchRef = useRef(null);
    const containerRef = useRef(null);
    const recentEmojis = useMemo(() => getRecentEmojis(), []);

    useEffect(() => {
        // Desktop keeps the caret in the search box on open, which is the whole
        // point of the box. Touch must not: focusing raises the software keyboard,
        // and the keyboard shrinks the visual viewport while this panel is
        // `absolute bottom-full` against a control that is itself mid-scroll, so
        // the panel ends up anchored to a viewport that no longer exists and its
        // top row is cut off. Opening without the keyboard is the fix; a mouse
        // user can still tab straight into the field.
        if (typeof window !== "undefined" && window.matchMedia?.("(hover: hover) and (pointer: fine)").matches) {
            searchRef.current?.focus();
        }
    }, []);

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (containerRef.current && !containerRef.current.contains(e.target)) {
                onClose();
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [onClose]);

    useEffect(() => {
        const handleKey = (e) => {
            if (e.key === "Escape") onClose();
        };
        document.addEventListener("keydown", handleKey);
        return () => document.removeEventListener("keydown", handleKey);
    }, [onClose]);

    const filteredEmojis = useMemo(() => {
        if (!search.trim()) return null;
        const q = search.toLowerCase();
        const results = [];
        const seen = new Set();
        for (const [cat, emojis] of Object.entries(EMOJI_DATA)) {
            for (const emoji of emojis) {
                if (seen.has(emoji)) continue;
                seen.add(emoji);
                results.push(emoji);
            }
        }
        return results;
    }, [search]);

    const handleSelect = useCallback((emoji) => {
        addRecentEmoji(emoji);
        onEmojiSelect(emoji);
    }, [onEmojiSelect]);

    const displayEmojis = useMemo(() => {
        if (filteredEmojis) return filteredEmojis;
        if (activeCategory === "recent") return recentEmojis;
        return EMOJI_DATA[activeCategory] || [];
    }, [filteredEmojis, activeCategory, recentEmojis]);

    return (
        <div
            ref={containerRef}
            // This panel is absolutely positioned inside a small toolbar button
            // wrapper, so a percentage width resolved against ~30px (comment
            // composer) to ~150px (composer) and the grid below landed in an
            // invisible horizontal scroll with 5 of 9 columns unreachable. The
            // size is therefore taken from the viewport rather than the anchor:
            // narrow phones get 100vw - 2rem, `sm` gets enough room for 9 columns
            // at a 40px target, and the height cap is dvh so a landscape phone
            // cannot push the top row off-screen. `min-w-0` lets it shrink inside
            // a flex parent instead of forcing one.
            className={`bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col min-w-0 w-[min(340px,calc(100vw-2rem))] sm:w-[392px] sm:max-w-[calc(100vw-2rem)] max-h-[min(420px,60dvh)] ${className}`}
        >
            {/* Search + skin tone */}
            <div className="flex items-center gap-2 p-2 border-b border-gray-100 dark:border-gray-800">
                <div className="flex-1 relative">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"
                        className="w-4 h-4 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                    </svg>
                    <input
                        ref={searchRef}
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search emoji..."
                        // 16px on touch: anything under that makes iOS zoom on
                        // focus, and the layout viewport meta makes it impossible
                        // to zoom back out.
                        className="w-full bg-gray-100 dark:bg-gray-800 text-base sm:text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 rounded-xl pl-8 pr-3 py-2 outline-none"
                    />
                </div>
                <div className="relative">
                    <button
                        onClick={() => setShowSkinTones(!showSkinTones)}
                        className="text-lg p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                        title="Skin tone"
                    >
                        {skinTone === 0 ? "✋" : `✋${SKIN_TONES[skinTone]}`}
                    </button>
                    {showSkinTones && (
                        // flex-wrap so the 44px swatches drop to a second row
                        // instead of overflowing a 320px screen.
                        <div className="absolute top-full right-0 mt-1 bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 p-2 flex flex-wrap justify-end gap-1 z-20">
                            {SKIN_TONE_LABELS.map((label, i) => (
                                <button
                                    key={label}
                                    onClick={() => { setSkinTone(i); setShowSkinTones(false); }}
                                    className={`text-lg p-2 rounded-lg transition-colors ${skinTone === i ? "bg-blue-100 dark:bg-blue-900/30" : "hover:bg-gray-100 dark:hover:bg-gray-800"}`}
                                    title={label}
                                >
                                    👋{SKIN_TONES[i]}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Category tabs */}
            <div className="flex gap-0.5 px-2 py-1.5 border-b border-gray-100 dark:border-gray-800 overflow-x-auto">
                {CATEGORIES.map((cat) => {
                    const show = cat.id === "recent" ? recentEmojis.length > 0 : true;
                    if (!show) return null;
                    return (
                        <button
                            key={cat.id}
                            onClick={() => { setActiveCategory(cat.id); setSearch(""); }}
                            className={`text-lg p-2 rounded-lg transition-colors shrink-0 ${
                                activeCategory === cat.id && !search
                                    ? "bg-blue-100 dark:bg-blue-900/30"
                                    : "hover:bg-gray-100 dark:hover:bg-gray-800"
                            }`}
                            title={cat.name}
                        >
                            {cat.label}
                        </button>
                    );
                })}
            </div>

            {/* Emoji grid */}
            <div className="p-2 overflow-y-auto flex-1 min-h-0 max-h-[min(280px,40dvh)]">
                {displayEmojis.length === 0 ? (
                    <div className="text-center text-sm text-gray-400 py-8">No emojis found</div>
                ) : (
                    // 7 columns on a phone so each cell keeps a ~44px touch
                    // target inside the viewport-sized panel; 9 only once there
                    // is room for it.
                    <div className="grid grid-cols-7 sm:grid-cols-9 gap-0.5">
                        {displayEmojis.map((emoji, i) => (
                            <button
                                key={`${emoji}-${i}`}
                                onClick={() => handleSelect(emoji)}
                                // Padding up, glyph down: 32x32 before, 44x44 now
                                // at a 18px emoji instead of a 20px one.
                                className="text-lg p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex items-center justify-center touch-manipulation"
                                title={emoji}
                            >
                                {emoji}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

export { CATEGORIES, EMOJI_DATA, SKIN_TONES };
