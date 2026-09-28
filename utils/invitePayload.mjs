/**
 * Turn whatever a QR scanner decoded into an invite code — or nothing.
 *
 * The one rule this file exists to enforce: **a scan yields a code, never a
 * destination.** Nothing downstream is allowed to navigate to a scanned string,
 * because a QR is untrusted input and `https://example.invalid/invite/CODE` is a
 * perfectly ordinary way to smuggle a hostile URL into a flow that otherwise
 * looks like it only reads a code. `extractInviteCode` therefore returns a bare
 * 10-character code or `null`, and the only URL anyone ever visits is one this
 * app builds itself from its own origin.
 *
 * Accepted shapes, because in practice a person will scan all of them:
 *   7KQR3M9X2P                     a code typed or read off a screen
 *   /invite/7KQR3M9X2P             a path, possibly relative
 *   https://host/invite/7KQR3M9X2P a full URL, any host, query or fragment
 *   .../invite/7KQR3M9X2P?ref=x   query and fragment are ignored
 *
 * Deliberately rejected: a bare URL that is not an invite link, and any string
 * whose last path segment is not a well-formed code. Guessing is what makes this
 * safe to feed straight into `POST /api/invites/greet`, which re-validates
 * server-side regardless.
 */

/** Crockford-style alphabet: no I/L/O/U, matching live-server/lib/invites.js. */
export const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
export const CODE_LENGTH = 10;

const CODE_RE = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);

/** Normalize and validate a candidate code, or return null. */
export function normalizeCode(raw) {
    const code = String(raw ?? "").trim().toUpperCase();
    return CODE_RE.test(code) ? code : null;
}

/** True when the string has the shape of an invite path/URL rather than a code. */
function looksLikeLink(value) {
    return /[/?#]/.test(value) || /^https?:\/\//i.test(value);
}

export function extractInviteCode(decoded) {
    const value = String(decoded ?? "").trim();
    if (!value) return null;

    // A bare code is the common case and needs no parsing.
    const direct = normalizeCode(value);
    if (direct) return direct;

    if (!looksLikeLink(value)) return null;

    // Take the last path segment and ignore the query/fragment. A path is parsed
    // by hand rather than via `new URL` because a scan is frequently a
    // protocol-relative or origin-less path, which `new URL` rejects outright.
    const withoutTail = value.split(/[?#]/, 1)[0];
    const segments = withoutTail.split("/").filter(Boolean);
    const last = segments[segments.length - 1];

    // Only treat a trailing segment as a code if the link actually looks like an
    // invite link, so a QR pointing at some unrelated URL is rejected outright
    // instead of having a random 10-character path segment coerced into a code.
    const isInvitePath = segments.length === 0
        || segments[segments.length - 2]?.toLowerCase() === "invite"
        || /\/invite$/i.test(withoutTail);
    if (!isInvitePath) return null;

    return normalizeCode(last);
}
