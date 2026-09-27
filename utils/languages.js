// The languages a reader can pick as their translation target.
//
// This list was 31 hardcoded <option> elements inside EditProfileModal and
// nothing else could reach it. Anything that needs to *name* the target language
// — a "Translate to Español" tooltip, a batch that reports what it translated
// into — has no way to do that without a second copy that drifts. One list, used
// by the settings picker and by every translate affordance.
//
// Codes are the ones the upstream translator accepts, which is also what
// `user.language` stores (live-server/models/user.js). `zh-CN`/`zh-TW` are kept
// distinct because the difference is the whole point for a Chinese speaker.

export const LANGUAGES = [
    { code: "en",    name: "English",        native: "English" },
    { code: "es",    name: "Spanish",        native: "Español" },
    { code: "fr",    name: "French",         native: "Français" },
    { code: "de",    name: "German",         native: "Deutsch" },
    { code: "pt",    name: "Portuguese",     native: "Português" },
    { code: "it",    name: "Italian",        native: "Italiano" },
    { code: "ja",    name: "Japanese",       native: "日本語" },
    { code: "ko",    name: "Korean",         native: "한국어" },
    { code: "zh-CN", name: "Chinese (Simplified)", native: "中文 (简体)" },
    { code: "zh-TW", name: "Chinese (Traditional)", native: "中文 (繁體)" },
    { code: "ar",    name: "Arabic",         native: "العربية" },
    { code: "hi",    name: "Hindi",          native: "हिन्दी" },
    { code: "ru",    name: "Russian",        native: "Русский" },
    { code: "tr",    name: "Turkish",        native: "Türkçe" },
    { code: "vi",    name: "Vietnamese",     native: "Tiếng Việt" },
    { code: "th",    name: "Thai",           native: "ไทย" },
    { code: "pl",    name: "Polish",         native: "Polski" },
    { code: "nl",    name: "Dutch",          native: "Nederlands" },
    { code: "sv",    name: "Swedish",        native: "Svenska" },
    { code: "id",    name: "Indonesian",     native: "Bahasa Indonesia" },
    { code: "ms",    name: "Malay",          native: "Bahasa Melayu" },
    { code: "uk",    name: "Ukrainian",      native: "Українська" },
    { code: "cs",    name: "Czech",          native: "Čeština" },
    { code: "ro",    name: "Romanian",       native: "Română" },
    { code: "el",    name: "Greek",          native: "Ελληνικά" },
    { code: "he",    name: "Hebrew",         native: "עברית" },
    { code: "fi",    name: "Finnish",        native: "Suomi" },
    { code: "no",    name: "Norwegian",      native: "Norsk" },
    { code: "da",    name: "Danish",         native: "Dansk" },
    { code: "hu",    name: "Hungarian",      native: "Magyar" },
];

const BY_CODE = new Map(LANGUAGES.map((l) => [l.code, l]));

/**
 * Human-readable name for a language code, falling back to the raw code.
 *
 * `user.language` is a plain String on the model with no enum, so a value from
 * an older client, a hand-edited database row, or a code this list has not
 * caught up with must render as *something*. Returning the code is honest; an
 * empty label would render a blank tooltip.
 */
export function languageName(code, { native = false } = {}) {
    const lang = BY_CODE.get(code);
    if (!lang) return code || "English";
    return native ? lang.native : lang.name;
}
