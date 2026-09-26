import Link from "next/link";

const DESTINATIONS = [
    { href: "/explore", label: "Explore", blurb: "Top posts, trending tags and every app" },
    { href: "/social", label: "Feed", blurb: "Catch up on what you follow" },
    { href: "/watch", label: "Watch", blurb: "Movies, series, anime and live TV" },
    { href: "/games", label: "Games", blurb: "Play something while you wait" },
];

export const metadata = {
    title: "Page not found",
};

export default function NotFound() {
    return (
        <div className="min-h-dvh app-bg flex items-center justify-center px-4 py-16">
            <div className="w-full max-w-lg text-center">
                <p className="app-title text-6xl sm:text-7xl font-black tracking-tight">404</p>
                <h1 className="mt-3 text-xl font-bold text-gray-900 dark:text-gray-100">
                    We couldn&apos;t find that page
                </h1>
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                    The link may be broken, or the post, profile or show it pointed at was deleted.
                </p>

                <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                    <Link href="/" className="btn-primary px-4 py-2.5 text-sm">
                        Go home
                    </Link>
                    <Link href="/explore" className="btn-secondary px-4 py-2.5 text-sm">
                        Explore
                    </Link>
                </div>

                <div className="mt-10 text-left">
                    <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">
                        Try one of these
                    </p>
                    <div className="mt-3 grid gap-2">
                        {DESTINATIONS.map((d) => (
                            <Link
                                key={d.href}
                                href={d.href}
                                className="group flex items-center justify-between rounded-2xl border border-[var(--border-subtle)] bg-white dark:bg-gray-900 px-4 py-3 hover:border-[var(--brand-400)] transition-colors"
                            >
                                <span>
                                    <span className="block text-sm font-bold text-gray-900 dark:text-gray-100">
                                        {d.label}
                                    </span>
                                    <span className="block text-xs text-gray-500 dark:text-gray-400">
                                        {d.blurb}
                                    </span>
                                </span>
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    strokeWidth={2}
                                    stroke="currentColor"
                                    aria-hidden="true"
                                    className="h-4 w-4 text-gray-400 group-hover:text-[var(--brand-500)] transition-colors"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"
                                    />
                                </svg>
                            </Link>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
