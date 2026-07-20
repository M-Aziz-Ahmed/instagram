import Link from "next/link";

export const metadata = {
    title: "Games - AnonTweet",
    description: "Play games with friends or AI - chess, Connect Four and more",
};

const GAMES = [
    {
        href: "/chess",
        title: "Chess",
        desc: "Classic strategy. Play vs friends or Stockfish AI.",
        emoji: "\u265F\uFE0F",
        gradient: "from-slate-700 to-slate-900",
    },
    {
        href: "/connect4",
        title: "Connect Four",
        desc: "Drop discs, connect four to win. vs friends or AI.",
        emoji: "\uD83D\uDD34",
        gradient: "from-blue-600 to-indigo-700",
    },
    {
        href: "/tictactoe",
        title: "Tic-Tac-Toe",
        desc: "Three in a row to win. vs friends or unbeatable AI.",
        emoji: "\u2B55\uFE0F",
        gradient: "from-emerald-500 to-teal-700",
    },
    {
        href: "/checkers",
        title: "Checkers",
        desc: "Mandatory captures, crown your kings. vs friends or AI.",
        emoji: "\u269B\uFE0F",
        gradient: "from-amber-600 to-orange-800",
    },
    {
        href: "/reversi",
        title: "Reversi",
        desc: "Flip discs to own the board. vs friends or AI.",
        emoji: "\u26AB",
        gradient: "from-emerald-600 to-green-800",
    },
    {
        href: "/battleship",
        title: "Battleship",
        desc: "Hunt and sink the enemy fleet. vs friends or AI.",
        emoji: "\uD83D\uDEA2",
        gradient: "from-cyan-600 to-blue-800",
    },
    {
        href: "/hangman",
        title: "Hangman",
        desc: "Guess the hidden word before it's too late.",
        emoji: "\uD83D\uDD24",
        gradient: "from-purple-600 to-fuchsia-800",
    },
];

export default function GamesPage() {
    return (
        <div className="max-w-4xl mx-auto px-4 py-8">
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Games</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">Challenge friends or play against the computer</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {GAMES.map((game) => (
                    <Link
                        key={game.href}
                        href={game.href}
                        className="group relative overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:border-blue-300 dark:hover:border-blue-700 transition-colors"
                    >
                        <div className={`h-24 bg-gradient-to-br ${game.gradient} flex items-center justify-center`}>
                            <span className="text-5xl group-hover:scale-110 transition-transform">{game.emoji}</span>
                        </div>
                        <div className="p-4">
                            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">{game.title}</h2>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{game.desc}</p>
                            <span className="inline-flex items-center gap-1 mt-3 text-xs font-medium text-blue-500">
                                Play now
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                                    <path fillRule="evenodd" d="M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                                </svg>
                            </span>
                        </div>
                    </Link>
                ))}
            </div>
        </div>
    );
}
