// Post-login redirect handling.
//
// The `?redirect=` value is written by proxy/middleware from the current
// pathname, but it arrives from the query string, so it must be treated as
// untrusted input. Handing it straight to `router.replace()` allowed an open
// redirect (`?redirect=//evil.com`, or any absolute URL) that bounced a
// freshly-authenticated user off-site. Only same-origin, path-only targets are
// honoured; everything else falls back to the default destination.

const DEFAULT_REDIRECT = "/";

// Values that would escape our origin once resolved against the current URL.
const ABSOLUTE_URL = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;
// "//evil.com" and "/\evil.com" are protocol-relative URLs.
const PROTOCOL_RELATIVE = /^\/[/\\]/;

export function safeRedirect(raw, fallback = DEFAULT_REDIRECT) {
    if (typeof raw !== "string") return fallback;

    const value = raw.trim();
    if (!value) return fallback;
    // Must be root-relative: a leading slash that is not followed by a second
    // slash (or a backslash) can only ever resolve within our own origin.
    if (!value.startsWith("/")) return fallback;
    if (PROTOCOL_RELATIVE.test(value)) return fallback;
    if (ABSOLUTE_URL.test(value)) return fallback;
    if (value.includes("\\")) return fallback;
    // Reject control characters, which can be used to smuggle a second header
    // or confuse downstream parsers.
    if (/[\u0000-\u001f\u007f]/.test(value)) return fallback;

    return value;
}

export function getRedirectTarget(searchParams, fallback = DEFAULT_REDIRECT) {
    return safeRedirect(searchParams?.get?.("redirect"), fallback);
}

// Carry `?redirect=` across an auth hop so the user still lands where they were
// headed after, e.g, recovering a PIN or redeeming an invite code.
export function withRedirect(path, searchParams) {
    const target = getRedirectTarget(searchParams, null);
    if (!target || target === DEFAULT_REDIRECT) return path;
    const sep = path.includes("?") ? "&" : "?";
    return `${path}${sep}redirect=${encodeURIComponent(target)}`;
}
