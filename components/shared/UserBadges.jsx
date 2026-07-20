"use client";

export function VerifiedBadge() {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="w-4 h-4 text-blue-500 shrink-0"
            aria-label="Verified"
            title="Verified"
        >
            <path
                fillRule="evenodd"
                d="M8.603 3.799A4.49 4.49 0 0 1 12 2.25c1.357 0 2.573.6 3.397 1.549a4.49 4.49 0 0 1 3.498 1.307 4.491 4.491 0 0 1 1.307 3.497A4.49 4.49 0 0 1 21.75 12a4.49 4.49 0 0 1-1.549 3.397 4.491 4.491 0 0 1-1.307 3.497 4.491 4.491 0 0 1-3.497 1.307A4.49 4.49 0 0 1 12 21.75a4.49 4.49 0 0 1-3.397-1.549 4.49 4.49 0 0 1-3.498-1.306 4.491 4.491 0 0 1-1.307-3.498A4.49 4.49 0 0 1 2.25 12c0-1.357.6-2.573 1.549-3.397a4.49 4.49 0 0 1 1.307-3.497 4.49 4.49 0 0 1 3.497-1.307Zm7.007 6.387a.75.75 0 1 0-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 0 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.14-.094l3.75-5.25Z"
                clipRule="evenodd"
            />
        </svg>
    );
}

export function RoleBadge({ role }) {
    return (
        <span
            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-white text-[10px] font-bold select-none shrink-0"
            style={{ backgroundColor: role.color }}
            title={role.name}
        >
            {role.badge} {role.name}
        </span>
    );
}

/** Shows verified + all role badges for a user */
export default function UserBadges({ isVerified, isAdmin, roles = [], size = "sm" }) {
    const hasVerified = isVerified || isAdmin;
    if (!hasVerified && roles.length === 0) return null;
    return (
        <span className="inline-flex items-center gap-1">
            {hasVerified && <VerifiedBadge />}
            {isAdmin && (
                <span
                    className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-purple-600 text-white text-[10px] font-bold select-none shrink-0"
                    title="Admin"
                >
                    ★ Admin
                </span>
            )}
            {roles.map((r, i) => <RoleBadge key={r._id ?? r.id ?? r.name ?? i} role={r} />)}
        </span>
    );
}
