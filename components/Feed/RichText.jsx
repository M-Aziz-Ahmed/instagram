"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { segmentByMatches } from "@/utils/toxicMatch";

const EMOJI_SHORTCODES = {
    ":smile:": "😄", ":grin:": "😁", ":laughing:": "😆", ":blush:": "😊", ":smiley:": "😃",
    ":relaxed:": "☺️", ":smirk:": "😏", ":heart_eyes:": "😍", ":kissing_heart:": "😘",
    ":kissing:": "😗", ":stuck_out_tongue_winking_eye:": "😜", ":stuck_out_tongue:": "😛",
    ":disappointed:": "😞", ":worried:": "😟", ":angry:": "😠", ":rage:": "😡",
    ":cry:": "😢", ":sob:": "😭", ":fearful:": "😨", ":weary:": "😩", ":tired_face:": "😫",
    ":scream:": "😱", ":open_mouth:": "😮", ":hushed:": "😯", ":sleeping:": "😴",
    ":sunglasses:": "😎", ":thinking:": "🤔", ":neutral_face:": "😐", ":expressionless:": "😑",
    ":unamused:": "😒", ":roll_eyes:": "🙄", ":grimacing:": "😬", ":relieved:": "😌",
    ":confused:": "😕", ":pensive:": "😔", ":confounded:": "😖", ":joy:": "😂",
    ":sweat:": "😓", ":cold_sweat:": "😰", ":innocent:": "😇", ":star_struck:": "🤩",
    ":cowboy:": "🤠", ":partying:": "🥳", ":disguised_face:": "🥸",
    ":thumbsup:": "👍", ":thumbsdown:": "👎", ":punch:": "👊", ":fist:": "✊",
    ":v:": "✌️", ":ok_hand:": "👌", ":raised_hands:": "🙌", ":clap:": "👏",
    ":wave:": "👋", ":muscle:": "💪", ":pray:": "🙏", ":handshake:": "🤝",
    ":heart:": "❤️", ":orange_heart:": "🧡", ":yellow_heart:": "💛", ":green_heart:": "💚",
    ":blue_heart:": "💙", ":purple_heart:": "💜", ":black_heart:": "🖤", ":white_heart:": "🤍",
    ":broken_heart:": "💔", ":sparkling_heart:": "💖", ":heartpulse:": "💗", ":heartbeat:": "💓",
    ":revolving_hearts:": "💞", ":two_hearts:": "💕", ":love_letter:": "💌", ":kiss:": "💋",
    ":fire:": "🔥", ":star:": "⭐", ":star2:": "🌟", ":zap:": "⚡", ":sparkles:": "✨",
    ":boom:": "💥", ":100:": "💯", ":white_check_mark:": "✅", ":x:": "❌",
    ":heavy_check_mark:": "✔️", ":question:": "❓", ":exclamation:": "❗",
    ":thumbsup:": "👍", ":wave:": "👋", ":eyes:": "👀", ":brain:": "🧠",
    ":rocket:": "🚀", ":gem:": "💎", ":crown:": "👑", ":trophy:": "🏆",
    ":medal:": "🏅", ":clapper:": "🎬", ":microphone:": "🎤", ":headphones:": "🎧",
    ":camera:": "📷", ":video_camera:": "📹", ":iphone:": "📱", ":computer:": "💻",
    ":game_die:": "🎲", ":chess:": "♟️", ":soccer:": "⚽", ":basketball:": "🏀",
    ":football:": "🏈", ":baseball:": "⚾", ":tennis:": "🎾", ":8ball:": "🎱",
    ":pizza:": "🍕", ":hamburger:": "🍔", ":fries:": "🍟", ":taco:": "🌮",
    ":beer:": "🍺", ":coffee:": "☕", ":cake:": "🎂", ":cookie:": "🍪",
    ":icecream:": "🍦", ":doughnut:": "🍩", ":apple:": "🍎", ":grapes:": "🍇",
    ":watermelon:": "🍉", ":melon:": "🍈", ":banana:": "🍌", ":peach:": "🍑",
    ":cherries:": "🍒", ":strawberry:": "🍓", ":tomato:": "🍅", ":corn:": "🌽",
    ":dog:": "🐶", ":cat:": "🐱", ":mouse:": "🐭", ":hamster:": "🐹",
    ":rabbit:": "🐰", ":bear:": "🐻", ":panda_face:": "🐼", ":koala:": "🐨",
    ":tiger:": "🐯", ":lion:": "🦁", ":cow:": "🐮", ":pig:": "🐷",
    ":frog:": "🐸", ":monkey:": "🐵", ":see_no_evil:": "🙈", ":hear_no_evil:": "🙉",
    ":speak_no_evil:": "🙊", ":bird:": "🐦", ":penguin:": "🐧", ":eagle:": "🦅",
    ":snake:": "🐍", ":turtle:": "🐢", ":whale:": "🐳", ":dolphin:": "🐬",
    ":octopus:": "🐙", ":butterfly:": "🦋", ":flower:": "🌸", ":rose:": "🌹",
    ":sunflower:": "🌻", ":earth_americas:": "🌎", ":rainbow:": "🌈",
    ":sunny:": "☀️", ":cloud:": "☁️", ":snowflake:": "❄️", ":umbrella:": "☂️",
    ":airplane:": "✈️", ":car:": "🚗", ":bus:": "🚌", ":train:": "🚆",
    ":ship:": "🚢", ":house:": "🏠", ":office:": "🏢", ":hospital:": "🏥",
    ":hotel:": "🏨", ":church:": "⛪", ":castle:": "🏰", ":tokyo_tower:": "🗼",
    ":mountain:": "🏔️", ":beach:": "🏖️", ":desert:": "🏜️", ":camping:": "🏕️",
    ":clown_face:": "🤡", ":ghost:": "👻", ":alien:": "👽", ":robot:": "🤖",
    ":skull:": "💀", ":poop:": "💩", ":eyeglasses:": "🕶️", ":nerd:": "🤓",
    ":bell:": "🔔", ":gift:": "🎁", ":balloon:": "🎈", ":tada:": "🎉",
    ":confetti:": "🎊", ":military_medal:": "🎖️", ":reminder_ribbon:": "🎗️",
    ":ticket:": "🎫", ":circus_tent:": "🎪", ":art:": "🎨", ":thread:": "🧵",
    ":tophat:": "🎩", ":crown:": "👑", ":lipstick:": "💄", ":nail_care:": "💅",
    ":ring:": "💍", ":purse:": "👛", ":handbag:": "👜", ":eyeglasses:": "👓",
};

// Module-level cache so the list is fetched once per page load rather than once
// per rendered comment. `cachedConfig` holds the words AND the match options,
// because the matching rules are admin-configurable and the client has to agree
// with the server on them.
let cachedConfig = null;
let toxicFetchPromise = null;

const EMPTY_FILTER = { words: [], allowlist: [], options: { wholeWord: true } };

function fetchToxicConfig() {
    if (toxicFetchPromise) return toxicFetchPromise;
    toxicFetchPromise = fetch("/api/admin/content-filter/public")
        .then((r) => r.ok ? r.json() : null)
        .catch(() => null)
        .then((data) => {
            cachedConfig = data?.toxicWords?.length && data?.blurToxicWords
                ? {
                    words: data.toxicWords,
                    allowlist: data.allowedWords || [],
                    options: data.matchOptions || { wholeWord: true },
                }
                : EMPTY_FILTER;
            return cachedConfig;
        });
    return toxicFetchPromise;
}

function parseShortcodes(text) {
    const regex = /:[a-zA-Z0-9_]+:/g;
    const parts = [];
    let lastIndex = 0;
    let match;
    while ((match = regex.exec(text)) !== null) {
        if (match.index > lastIndex) {
            parts.push(text.slice(lastIndex, match.index));
        }
        const shortcode = match[0];
        parts.push(EMOJI_SHORTCODES[shortcode] || shortcode);
        lastIndex = regex.lastIndex;
    }
    if (lastIndex < text.length) {
        parts.push(text.slice(lastIndex));
    }
    return parts.join("");
}

const EMOJI_REGEX_STR = Object.keys(EMOJI_SHORTCODES).map(k => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");

// URLs are matched ahead of hashtags so that the `#section` in
// `https://example.com/page#section` stays inside the link instead of being
// split out into a hashtag button pointing at a tag that does not exist.
//
// The character class stops at whitespace and the quote/angle characters that
// delimit an attribute, so text pasted from a browser or a chat client cannot
// swallow surrounding markup into the href.
const URL_REGEX_STR = "https?:\\/\\/[^\\s<>\"'`]+\\u2026";

// Only http(s). A bare "example.com" is far more likely to be prose than a
// link, and auto-linking it would mangle ordinary sentences.
const URL_ONLY = /^https?:\/\/\S+$/i;

// A link at the end of a sentence almost always has the sentence's punctuation
// stuck to it, and that punctuation is not part of the URL.
const URL_TRAILING_PUNCT = /[.,;:!?)\]}]+$/;

const FULL_REGEX = new RegExp(`(${URL_REGEX_STR}|#[a-zA-Z0-9_]+|@[a-zA-Z0-9_]+|${EMOJI_REGEX_STR})`, "g");

function ToxicSegment({ text }) {
    const [hovered, setHovered] = useState(false);
    // Blur-to-reveal was wired to `onMouseEnter`/`onMouseLeave` only, and there
    // is no hover on touch: on a phone every filtered word stayed
    // `blur-[5px] text-transparent` forever, so the content filter silently
    // failed on mobile. `revealed` is the tap path — a real button, so it is
    // reachable by keyboard and screen reader too, not just by a synthetic
    // touch event.
    const [revealed, setRevealed] = useState(() => new Set());
    const [config, setConfig] = useState(cachedConfig || EMPTY_FILTER);

    useEffect(() => {
        if (cachedConfig === null) {
            fetchToxicConfig().then(setConfig);
        }
    }, []);

    const toggleRevealed = (index) => {
        setRevealed((prev) => {
            const next = new Set(prev);
            if (next.has(index)) next.delete(index);
            else next.add(index);
            return next;
        });
    };

    if (!config.words.length) return <span>{text}</span>;

    // `segmentByMatches` replaces the old `text.split(/(ass|...)/gi)`
    // tokenizer, which had no word boundaries and therefore blurred "ass"
    // *inside* "assistant", "classes" and "pass" — and because `split` with a
    // capture group emits the match as its own element, only that fragment was
    // blurred, so the user saw a partly legible word rather than a clean filter.
    const segments = segmentByMatches(text, config.words, {
        ...config.options,
        allowlist: config.allowlist,
    });

    return (
        <span
            // `pointerType` is checked because mobile browsers synthesise
            // mouseover/mouseout around a tap. Without the guard, tapping a
            // word would flip the container-wide hover state on and leave the
            // rest of the comment revealed until the next tap elsewhere.
            onPointerEnter={(e) => { if (e.pointerType === "mouse") setHovered(true); }}
            onPointerLeave={(e) => { if (e.pointerType === "mouse") setHovered(false); }}
        >
            {segments.map((seg, i) => {
                if (!seg.text) return null;
                if (seg.toxic) {
                    const isRevealed = hovered || revealed.has(i);
                    return (
                        <button
                            key={i}
                            type="button"
                            // The whole post card is a link, so without this the
                            // tap that reveals the word would also navigate away.
                            onClick={(e) => { e.stopPropagation(); toggleRevealed(i); }}
                            aria-label={isRevealed ? `Hide filtered word` : `Reveal filtered word`}
                            aria-expanded={isRevealed}
                            className={`inline-block rounded border-0 bg-transparent p-0 text-inherit [line-height:inherit] align-baseline transition-all duration-200 cursor-pointer select-none touch-manipulation ${
                                isRevealed
                                    ? "blur-none text-red-500 dark:text-red-400 font-semibold"
                                    : "blur-[5px] bg-gray-400/30 dark:bg-gray-500/30 text-transparent"
                            }`}
                            title={isRevealed ? "Tap to hide" : "Tap to reveal"}
                        >
                            {seg.text}
                        </button>
                    );
                }
                return <span key={i}>{seg.text}</span>;
            })}
        </span>
    );
}

export default function RichText({ text, onHashtag, className = "", toxicWords = false }) {
    if (!text) return null;

    const parts = text.split(FULL_REGEX);

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
                if (EMOJI_SHORTCODES[part]) {
                    return <span key={i} className="text-base leading-none">{EMOJI_SHORTCODES[part]}</span>;
                }
                if (URL_ONLY.test(part)) {
                    // Links used to fall through to the bare <span> below, which
                    // rendered them as inert text: not clickable, not styled as a
                    // link, and impossible to open. A post whose whole content is
                    // a video URL showed a dead string with no way to follow it.
                    const href = part.replace(URL_TRAILING_PUNCT, "");
                    const trailing = part.slice(href.length);
                    if (!href) return <span key={i}>{part}</span>;
                    return (
                        <span key={i}>
                            <a
                                href={href}
                                target="_blank"
                                rel="noopener noreferrer nofollow"
                                // The post card is itself clickable, so without
                                // this, following a link would also fire the
                                // card's navigation and land the user somewhere
                                // they did not ask for.
                                onClick={(e) => e.stopPropagation()}
                                className="text-blue-500 hover:text-blue-600 hover:underline break-all"
                            >
                                {href}
                            </a>
                            {trailing}
                        </span>
                    );
                }
                if (toxicWords && part.length > 0) {
                    return <ToxicSegment key={i} text={part} />;
                }
                return <span key={i}>{part}</span>;
            })}
        </span>
    );
}

export { EMOJI_SHORTCODES, parseShortcodes };
