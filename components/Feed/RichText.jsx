"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";

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

let cachedToxicWords = null;
let toxicFetchPromise = null;

function fetchToxicWords() {
    if (toxicFetchPromise) return toxicFetchPromise;
    toxicFetchPromise = fetch("/api/admin/content-filter/public")
        .then((r) => r.ok ? r.json() : null)
        .catch(() => null)
        .then((data) => {
            cachedToxicWords = data?.toxicWords?.length && data?.blurToxicWords ? data.toxicWords.map((w) => w.toLowerCase()) : [];
            return cachedToxicWords;
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
    const [toxicWords, setToxicWords] = useState(cachedToxicWords || []);

    useEffect(() => {
        if (cachedToxicWords === null) {
            fetchToxicWords().then(setToxicWords);
        }
    }, []);

    if (toxicWords.length === 0) return <span>{text}</span>;

    const pattern = new RegExp(`(${toxicWords.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
    const segments = text.split(pattern);
    let key = 0;

    return (
        <span
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
        >
            {segments.map((seg) => {
                if (!seg) return null;
                const isToxic = toxicWords.some((w) => seg.toLowerCase() === w);
                if (isToxic) {
                    return (
                        <span
                            key={key++}
                            className={`inline-block transition-all duration-200 cursor-pointer select-none rounded ${
                                hovered
                                    ? "blur-none text-red-500 dark:text-red-400 font-semibold"
                                    : "blur-[5px] bg-gray-400/30 dark:bg-gray-500/30 text-transparent"
                            }`}
                            title={hovered ? seg : "Hover to reveal"}
                        >
                            {seg}
                        </span>
                    );
                }
                return <span key={key++}>{seg}</span>;
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
