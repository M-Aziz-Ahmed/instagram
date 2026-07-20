"use client";

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
const FULL_REGEX = new RegExp(`(#[a-zA-Z0-9_]+|@[a-zA-Z0-9_]+|${EMOJI_REGEX_STR})`, "g");

export default function RichText({ text, onHashtag, className = "" }) {
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
                return <span key={i}>{part}</span>;
            })}
        </span>
    );
}

export { EMOJI_SHORTCODES, parseShortcodes };
