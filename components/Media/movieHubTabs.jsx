/**
 * The Movie Hub's category registry.
 *
 * Everything the entertainment section used to scatter across seven separate
 * routes now lives in one tabbed surface. The tab order is deliberate: it goes
 * from the broadest-intent category (movies) to the most-niche, and ends with
 * live TV because that tab behaves differently from everything else.
 *
 * `id` is the URL contract (`/watch?tab=<id>`), so it must stay stable — old
 * links, bookmarks and the legacy route redirects all key off it.
 */

const icon = (path, extra = null) => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.8}
        stroke="currentColor"
        aria-hidden="true"
    >
        <path strokeLinecap="round" strokeLinejoin="round" d={path} />
        {extra}
    </svg>
);

const ICONS = {
    movie: icon("M3.75 9.75 12 3m0 0 8.25 6.75M12 3v18m0-18 8.25 6.75M12 12 3.75 18.75M12 12l8.25 6.75"),
    series: icon(
        "M6 4.5h12a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 18V6A1.5 1.5 0 0 1 6 4.5Z",
        <path strokeLinecap="round" strokeLinejoin="round" d="M10 9.75v4.5l3.75-2.25L10 9.75Z" />,
    ),
    kdrama: icon(
        "M12 20.25s-7.5-4.36-7.5-10.28A4.22 4.22 0 0 1 12 7.6a4.22 4.22 0 0 1 7.5 2.37c0 5.92-7.5 10.28-7.5 10.28Z",
    ),
    cdrama: icon(
        "M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1m0-12.8-2.1 2.1M7.7 16.3l-2.1 2.1",
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8.25a3.75 3.75 0 1 0 0 7.5 3.75 3.75 0 0 0 0-7.5Z" />,
    ),
    cartoon: icon(
        "M9.53 16.122a3 3 0 0 0-5.78 1.128 2.25 2.25 0 0 1-2.25 2.25 1.5 1.5 0 0 1-1.5-1.5 2.25 2.25 0 0 1 2.25-2.25 3 3 0 0 0 4.28-4.28 2.25 2.25 0 0 1 2.25-2.25 3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 1 2.25 2.25 3 3 0 0 0 0 4.28",
    ),
    anime: icon(
        "M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z",
    ),
    livetv: icon(
        "M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5",
    ),
};

export const MOVIE_HUB_TABS = [
    {
        id: "movies",
        label: "Movies",
        blurb: "Hollywood, blockbusters and top picks",
        kind: "media",
        mediaType: "movie",
        accent: "from-violet-600 via-purple-600 to-indigo-700",
    },
    {
        id: "series",
        label: "Series",
        blurb: "TV seasons and full series",
        kind: "media",
        mediaType: "season",
        accent: "from-indigo-500 via-blue-600 to-sky-700",
    },
    {
        id: "kdramas",
        label: "K-Dramas",
        blurb: "Korean drama series",
        kind: "media",
        mediaType: "kdrama",
        accent: "from-rose-500 via-pink-600 to-fuchsia-700",
    },
    {
        id: "cdramas",
        label: "C-Dramas",
        blurb: "Chinese drama series",
        kind: "media",
        mediaType: "cdrama",
        accent: "from-amber-500 via-orange-600 to-red-700",
    },
    {
        id: "cartoons",
        label: "Cartoons",
        blurb: "Animated favourites",
        kind: "media",
        mediaType: "cartoon",
        accent: "from-teal-500 via-emerald-600 to-cyan-700",
    },
    {
        id: "anime",
        label: "Anime",
        blurb: "Subbed & dubbed anime",
        kind: "anime",
        accent: "from-pink-500 via-fuchsia-600 to-purple-700",
    },
    {
        id: "live-tv",
        label: "Live TV",
        blurb: "Streaming channels, always on",
        kind: "live-tv",
        accent: "from-sky-500 via-cyan-600 to-blue-700",
    },
];

export const DEFAULT_HUB_TAB = MOVIE_HUB_TABS[0].id;

export function getHubTab(id) {
    return MOVIE_HUB_TABS.find((t) => t.id === id) || MOVIE_HUB_TABS[0];
}

export function isHubTab(id) {
    return MOVIE_HUB_TABS.some((t) => t.id === id);
}

export { ICONS as HUB_TAB_ICONS };
