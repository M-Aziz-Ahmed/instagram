import Link from "next/link";

const APPS = [
    {
        group: "Streaming",
        items: [
            { href: "/movies", title: "Movies", desc: "Hollywood & top picks", emoji: "🎬", gradient: "from-violet-600 to-purple-800" },
            { href: "/anime", title: "Anime", desc: "Anime episodes & watchlists", emoji: "🍥", gradient: "from-pink-500 to-fuchsia-700" },
            { href: "/kdramas", title: "K-Dramas", desc: "Korean drama series", emoji: "🎎", gradient: "from-rose-500 to-red-700" },
            { href: "/cdramas", title: "Chinese Dramas", desc: "C-drama series", emoji: "🏮", gradient: "from-amber-500 to-orange-700" },
            { href: "/seasons", title: "Seasons", desc: "TV seasons catalog", emoji: "📺", gradient: "from-indigo-500 to-blue-700" },
            { href: "/cartoons", title: "Cartoons", desc: "Animated favorites", emoji: "🧸", gradient: "from-teal-500 to-cyan-700" },
            { href: "/channels", title: "Channels", desc: "Live-ish stream channels", emoji: "📡", gradient: "from-sky-500 to-blue-700" },
        ],
    },
    {
        group: "Games",
        items: [
            { href: "/games", title: "Games Hub", desc: "All games in one place", emoji: "🕹️", gradient: "from-emerald-500 to-green-800" },
            { href: "/chess", title: "Chess", desc: "vs friends or AI", emoji: "♟️", gradient: "from-slate-700 to-slate-900" },
            { href: "/connect4", title: "Connect Four", desc: "Drop & connect", emoji: "🔴", gradient: "from-blue-600 to-indigo-800" },
            { href: "/game2048", title: "2048", desc: "Merge the tiles", emoji: "🔢", gradient: "from-indigo-600 to-violet-800" },
            { href: "/minesweeper", title: "Minesweeper", desc: "Clear the field", emoji: "💣", gradient: "from-teal-600 to-cyan-800" },
            { href: "/leaderboard", title: "Leaderboard", desc: "Ranks & achievements", emoji: "🏆", gradient: "from-yellow-500 to-amber-700" },
        ],
    },
    {
        group: "Reading",
        items: [
            { href: "/manga", title: "Manga", desc: "Read the latest chapters", emoji: "📖", gradient: "from-cyan-500 to-teal-700" },
        ],
    },
    {
        group: "Discover",
        items: [
            { href: "/browser", title: "Browser", desc: "A real web browser", emoji: "🌐", gradient: "from-blue-500 to-indigo-700" },
            { href: "/trending", title: "What's Happening", desc: "Trending now", emoji: "🔥", gradient: "from-orange-500 to-red-700" },
        ],
    },
];

export default function EntertainmentHub() {
    return (
        <div className="min-h-dvh bg-white dark:bg-gray-950">
            <header className="sticky top-0 z-20 bg-white/90 dark:bg-gray-950/90 backdrop-blur border-b border-gray-200 dark:border-gray-800 safe-top">
                <div className="max-w-4xl mx-auto px-4 h-12 sm:h-14 flex items-center justify-between">
                    <div>
                        <h1 className="font-black text-lg sm:text-xl tracking-tight text-gray-900 dark:text-gray-100">Entertainment</h1>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 -mt-0.5 hidden sm:block">Sub-apps for watching, reading & playing</p>
                    </div>
                </div>
            </header>

            <div className="max-w-4xl mx-auto px-4 py-6">
                {APPS.map(({ group, items }) => (
                    <div key={group} className="mb-8">
                        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-3">
                            {group}
                        </h2>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            {items.map((a) => (
                                <Link
                                    key={a.href}
                                    href={a.href}
                                    className="group relative overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:border-blue-300 dark:hover:border-blue-700 transition-colors"
                                >
                                    <div className={`h-20 bg-gradient-to-br ${a.gradient} flex items-center justify-center`}>
                                        <span className="text-4xl group-hover:scale-110 transition-transform">{a.emoji}</span>
                                    </div>
                                    <div className="p-3.5">
                                        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{a.title}</h3>
                                        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{a.desc}</p>
                                        <span className="inline-flex items-center gap-1 mt-2 text-[11px] font-medium text-blue-500">
                                            Open
                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                                                <path fillRule="evenodd" d="M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                                            </svg>
                                        </span>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}