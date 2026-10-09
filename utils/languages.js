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
//
// The data lives in live-server/lib/languages.json rather than inline here
// because the live server has to validate `user.language` on write
// (routes/auth.js) and it is CommonJS — it cannot import this ES module. Two
// copies of a list whose whole purpose is to be authoritative is the drift
// this file exists to prevent.
//
// The file lives under live-server/ rather than here on purpose. live-server is
// deployed as a self-contained unit (deploy/bootstrap.sh rsyncs that directory
// to /opt/anontweet-live-server), so anything it requires has to travel with
// it — a `../../utils/...` require from the server resolves fine in this repo
// and throws MODULE_NOT_FOUND in production, taking the whole server down at
// boot rather than failing one request.
//
// utils/translateApi.test.mjs asserts the two stay in agreement.

import LANGUAGES_DATA from "../live-server/lib/languages.json";

export const LANGUAGES = LANGUAGES_DATA;

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
