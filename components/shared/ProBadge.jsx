// Shown next to a username while a Pro subscription is active.
//
// Takes the value the server sent rather than reading the expiry itself: the
// server already derives `isPro` from `proUntil` on every profile and /me read,
// so the badge disappears the moment the subscription lapses without this
// component having to own a clock or poll for one.
export default function ProBadge({ isPro, className = "" }) {
    if (!isPro) return null;

    return (
        <span
            className={`inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-400 to-amber-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white ${className}`}
            title="Pro — no ads on any surface"
        >
            <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="h-2.5 w-2.5"
                aria-hidden="true"
            >
                <path d="M5 3l4.5 2.5L15 3l1.5 3.5L21 5l-1 6h3l-3.5 6-2.5-4-4 4 1-6H5l1-6H3l3.5-6L5 3z" />
            </svg>
            Pro
        </span>
    );
}
