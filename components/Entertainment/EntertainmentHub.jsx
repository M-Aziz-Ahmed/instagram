import Link from "next/link";
import { MOVIE_HUB_TABS, HUB_TAB_ICONS } from "@/components/Media/movieHubTabs";

/**
 * Entertainment landing.
 *
 * Watchable content is no longer a grid of seven separate category cards — it
 * lives behind the Movie Hub, which is the featured destination below. What
 * remains here is everything that isn't video: games, reading and discovery.
 * The categories are still listed as sub-tabs so nothing became undiscoverable.
 */

const GROUPS = [
    {
        group: "Play",
        blurb: "Something to do with your hands",
        items: [
            { href: "/games", title: "Games Hub", desc: "Every game in one place", emoji: "🕹️", gradient: "from-emerald-500 to-green-800" },
            { href: "/chess", title: "Chess", desc: "Play a friend or the AI", emoji: "♟️", gradient: "from-slate-700 to-slate-900" },
            { href: "/connect4", title: "Connect Four", desc: "Drop, connect, win", emoji: "🔴", gradient: "from-blue-600 to-indigo-800" },
            { href: "/game2048", title: "2048", desc: "Merge the tiles", emoji: "🔢", gradient: "from-indigo-600 to-violet-800" },
            { href: "/minesweeper", title: "Minesweeper", desc: "Clear the field", emoji: "💣", gradient: "from-teal-600 to-cyan-800" },
            { href: "/leaderboard", title: "Leaderboard", desc: "Ranks and achievements", emoji: "🏆", gradient: "from-yellow-500 to-amber-700" },
        ],
    },
    {
        group: "Read",
        blurb: "Pages, not pixels",
        items: [
            { href: "/manga", title: "Manga", desc: "Read the latest chapters", emoji: "📖", gradient: "from-cyan-500 to-teal-700" },
        ],
    },
    {
        group: "Discover",
        blurb: "Everything outside the app",
        items: [
            { href: "/browser", title: "Browser", desc: "A real in-app web browser", emoji: "🌐", gradient: "from-blue-500 to-indigo-700" },
            { href: "/trending", title: "What's Happening", desc: "Trending right now", emoji: "🔥", gradient: "from-orange-500 to-red-700" },
        ],
    },
];

export default function EntertainmentHub() {
    return (
        <div className="min-h-dvh app-bg">
            <header className="app-header safe-top">
                <div className="max-w-6xl mx-auto px-4 h-12 sm:h-14 flex items-center justify-between">
                    <div>
                        <h1 className="app-title text-lg sm:text-xl text-gray-900 dark:text-gray-100">
                            Entertainment
                        </h1>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 -mt-0.5 hidden sm:block">
                            Watch, read & play
                        </p>
                    </div>
                    <Link href="/watch" className="btn-secondary px-3.5 py-2 text-xs">
                        Open Movie Hub
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-3.5 w-3.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                        </svg>
                    </Link>
                </div>
            </header>

            <div className="max-w-6xl mx-auto px-4 py-6 sm:py-8">
                {/* ── Featured: the Movie Hub ── */}
                <section className="mb-10">
                    <Link
                        href="/watch"
                        className="group relative block overflow-hidden rounded-3xl border border-[var(--border-subtle)] shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-lift)] transition-shadow"
                    >
                        <div
                            aria-hidden="true"
                            className="absolute inset-0 bg-[var(--brand-gradient)]"
                        />
                        <div
                            aria-hidden="true"
                            className="absolute inset-0 bg-gradient-to-br from-black/25 via-transparent to-black/45"
                        />
                        {/* Decorative glow that reacts to hover. */}
                        <div
                            aria-hidden="true"
                            className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/20 blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                        />

                        <div className="relative px-5 sm:px-8 py-7 sm:py-10">
                            <div className="flex flex-wrap items-center gap-2 mb-3">
                                <span className="rounded-full bg-white/20 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-white backdrop-blur-sm">
                                    All streaming, one place
                                </span>
                            </div>
                            <h2 className="text-2xl sm:text-4xl font-black tracking-tight text-white leading-[1.1]">
                                Movie Hub
                            </h2>
                            <p className="mt-2 max-w-lg text-sm sm:text-base text-white/85 leading-relaxed">
                                Movies, series, K-dramas, C-dramas, cartoons, anime and live TV —
                                merged into one tabbed player instead of seven separate pages.
                            </p>

                            {/* Category preview doubles as the tab list. */}
                            <div className="mt-5 flex flex-wrap gap-1.5">
                                {MOVIE_HUB_TABS.map((t) => (
                                    <span
                                        key={t.id}
                                        className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-[11px] font-semibold text-white backdrop-blur-sm ring-1 ring-inset ring-white/20 group-hover:bg-white/25 transition-colors [&>svg]:h-3.5 [&>svg]:w-3.5"
                                    >
                                        {HUB_TAB_ICONS[t.id]}
                                        {t.label}
                                    </span>
                                ))}
                            </div>

                            <span className="btn mt-6 bg-white text-[var(--brand-700)] px-5 py-3 text-sm shadow-lg group-hover:shadow-xl">
                                <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                                    <path d="M8 5v14l11-7z" />
                                </svg>
                                Start watching
                            </span>
                        </div>
                    </Link>
                </section>

                {/* ── Everything else ── */}
                {GROUPS.map(({ group, blurb, items }) => (
                    <section key={group} className="mb-9">
                        <div className="mb-3.5">
                            <p className="section-eyebrow">{group}</p>
                            <h2 className="app-title text-base sm:text-lg text-gray-900 dark:text-gray-100">
                                {blurb}
                            </h2>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                            {items.map((a) => (
                                <Link
                                    key={a.href}
                                    href={a.href}
                                    className="surface-interactive group overflow-hidden"
                                >
                                    <div className={`h-16 bg-gradient-to-br ${a.gradient} flex items-center justify-center`}>
                                        <span className="text-3xl transition-transform duration-300 group-hover:scale-110">
                                            {a.emoji}
                                        </span>
                                    </div>
                                    <div className="p-3.5">
                                        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                                            {a.title}
                                        </h3>
                                        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-1">
                                            {a.desc}
                                        </p>
                                        <span className="inline-flex items-center gap-1 mt-2 text-[11px] font-semibold text-[var(--brand-600)] dark:text-[var(--brand-300)]">
                                            Open
                                            <svg
                                                xmlns="http://www.w3.org/2000/svg"
                                                viewBox="0 0 20 20"
                                                fill="currentColor"
                                                className="h-3 w-3 transition-transform group-hover:translate-x-0.5"
                                            >
                                                <path
                                                    fillRule="evenodd"
                                                    d="M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z"
                                                    clipRule="evenodd"
                                                />
                                            </svg>
                                        </span>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    </section>
                ))}
            </div>
        </div>
    );
}
