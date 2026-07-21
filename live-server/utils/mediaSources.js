const MediaSource = {
    ANIME: {
        type: "anime",
        label: "Anime",
        emoji: "🎬",
        searchType: "ANIME",
        apiRoute: "/api/anime",
        metadataSource: "anilist",
        streamSource: "gogoanime",
        coverPattern: (id) => `https://img.anili.st/media/${id}`,
        defaultGenres: ["Action", "Adventure", "Comedy", "Drama", "Fantasy", "Horror", "Mystery", "Romance", "Sci-Fi", "Slice of Life", "Sports", "Supernatural", "Thriller"],
    },
    MOVIE: {
        type: "movie",
        label: "Movies",
        emoji: "🎥",
        searchType: "MOVIE",
        apiRoute: "/api/movies",
        metadataSource: "tmdb",
        streamSource: "VIDSRC",
        coverPattern: (id) => `https://image.tmdb.org/t/p/w500/${id}`,
        defaultGenres: ["Action", "Adventure", "Animation", "Comedy", "Crime", "Documentary", "Drama", "Family", "Fantasy", "History", "Horror", "Music", "Mystery", "Romance", "Science Fiction", "TV Movie", "Thriller", "War", "Western"],
    },
    KDORAMA: {
        type: "kdrama",
        label: "K-Dramas",
        emoji: "🇰🇷",
        searchType: "TV",
        apiRoute: "/api/kdramas",
        metadataSource: "tmdb",
        streamSource: "DRAMACOOL",
        coverPattern: (id) => `https://image.tmdb.org/t/p/w500/${id}`,
        defaultGenres: ["Action", "Adventure", "Comedy", "Crime", "Drama", "Fantasy", "Historical", "Horror", "Legal", "Medical", "Melodrama", "Mystery", "Psychological", "Romance", "School", "Thriller"],
    },
    CDRAMA: {
        type: "cdrama",
        label: "Chinese Dramas",
        emoji: "🇨🇳",
        searchType: "TV",
        apiRoute: "/api/cdramas",
        metadataSource: "tmdb",
        streamSource: "CDRAMA",
        coverPattern: (id) => `https://image.tmdb.org/t/p/w500/${id}`,
        defaultGenres: ["Action", "Adventure", "Comedy", "Drama", "Fantasy", "Historical", "Mystery", "Romance", "Wuxia", "Xianxia", "Political", "Family"],
    },
    CARTOON: {
        type: "cartoon",
        label: "Cartoons",
        emoji: "📺",
        searchType: "TV",
        apiRoute: "/api/cartoons",
        metadataSource: "tmdb",
        streamSource: "KISSCARTOON",
        coverPattern: (id) => `https://image.tmdb.org/t/p/w500/${id}`,
        defaultGenres: ["Action", "Adventure", "Comedy", "Family", "Fantasy", "Musical", "Sci-Fi", "Superhero", "Educational", "Preschool"],
    },
    SEASON: {
        type: "season",
        label: "Seasons/Series",
        emoji: "📅",
        searchType: "TV",
        apiRoute: "/api/seasons",
        metadataSource: "tmdb",
        streamSource: "VIDSRC",
        coverPattern: (id) => `https://image.tmdb.org/t/p/w500/${id}`,
        defaultGenres: ["Action", "Adventure", "Animation", "Comedy", "Crime", "Drama", "Fantasy", "Horror", "Mystery", "Sci-Fi", "Thriller"],
    },
};

const MediaSourceList = Object.values(MediaSource);

function getMediaSource(type) {
    return MediaSource[type.toUpperCase()] || MediaSource.ANIME;
}

function getAllMediaTypes() {
    return MediaSourceList;
}

module.exports = {
    MediaSource,
    MediaSourceList,
    getMediaSource,
    getAllMediaTypes,
};