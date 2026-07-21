import { NextResponse } from "next/server";

const TMDB_API_KEY = process.env.TMDB_API_KEY || "demo_key_for_testing";

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q");
    const id = searchParams.get("id");

    if (query) {
        const searchUrl = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&language=en-US&page=1`;

        try {
            const searchResponse = await fetch(searchUrl);

            if (!searchResponse.ok) {
                return NextResponse.json({ error: "TMDB API error", details: await searchResponse.text() }, { status: 500 });
            }

            const searchData = await searchResponse.json();
            const results = (searchData.results || []).slice(0, 20).map(movie => ({
                id: movie.id,
                title: movie.title,
                name: movie.title,
                overview: movie.overview,
                posterPath: movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : "/placeholder-movie.png",
                backdropPath: movie.backdrop_path ? `https://image.tmdb.org/t/p/original${movie.backdrop_path}` : "",
                releaseDate: movie.release_date,
                voteAverage: movie.vote_average,
                genreIds: movie.genre_ids || [],
                firstAirDate: movie.release_date,
                originalTitle: movie.original_title,
                media_type: "movie"
            }));

            return NextResponse.json({
                results,
                page: searchData.page || 1,
                total_pages: searchData.total_pages || 1,
                total_results: searchData.total_results || 0
            });
        } catch (error) {
            console.error("TMDB search error:", error);
            return NextResponse.json({ error: "TMDB API request failed", details: error.message }, { status: 500 });
        }
    }

    if (id) {
        const detailsUrl = `https://api.themoviedb.org/3/movie/${id}?api_key=${TMDB_API_KEY}&language=en-US&append_to_response=credits,videos`;

        try {
            const detailsResponse = await fetch(detailsUrl);

            if (!detailsResponse.ok) {
                return NextResponse.json({ error: "TMDB movie details error", details: await detailsResponse.text() }, { status: 500 });
            }

            const movieDetails = await detailsResponse.json();
            const genres = (movieDetails.genres || []).map(g => g.name);

            return NextResponse.json({
                id: movieDetails.id,
                title: movieDetails.title,
                name: movieDetails.title,
                overview: movieDetails.overview,
                posterPath: movieDetails.poster_path ? `https://image.tmdb.org/t/p/w500${movieDetails.poster_path}` : "/placeholder-movie.png",
                backdropPath: movieDetails.backdrop_path ? `https://image.tmdb.org/t/p/original${movieDetails.backdrop_path}` : "",
                releaseDate: movieDetails.release_date,
                firstAirDate: movieDetails.release_date,
                voteAverage: movieDetails.vote_average,
                status: movieDetails.status,
                originalTitle: movieDetails.original_title,
                genres,
                runtime: movieDetails.runtime,
                tagline: movieDetails.tagline,
                productionCompanies: movieDetails.production_companies || [],
                productionCountries: movieDetails.production_countries || [],
                spokenLanguages: movieDetails.spoken_languages || [],
                homepage: movieDetails.homepage,
                imdbId: movieDetails.imdb_id,
                videos: movieDetails.videos || { results: [] }
            });
        } catch (error) {
            console.error("TMDB movie details error:", error);
            return NextResponse.json({ error: "TMDB movie details failed", details: error.message }, { status: 500 });
        }
    }

    if (searchParams.get("trending")) {
        const timeWindow = searchParams.get("time_window") || "week";
        const trendingUrl = `https://api.themoviedb.org/3/trending/movie/${timeWindow}?api_key=${TMDB_API_KEY}&language=en-US`;

        try {
            const trendingResponse = await fetch(trendingUrl);

            if (!trendingResponse.ok) {
                return NextResponse.json({ error: "TMDB trending error", details: await trendingResponse.text() }, { status: 500 });
            }

            const trendingData = await trendingResponse.json();
            const results = (trendingData.results || []).slice(0, 18).map(movie => ({
                id: movie.id,
                title: movie.title,
                name: movie.title,
                overview: movie.overview,
                posterPath: movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : "/placeholder-movie.png",
                backdropPath: movie.backdrop_path ? `https://image.tmdb.org/t/p/original${movie.backdrop_path}` : "",
                releaseDate: movie.release_date,
                voteAverage: movie.vote_average,
                genreIds: movie.genre_ids || [],
                media_type: "movie"
            }));

            return NextResponse.json({
                results,
                page: trendingData.page || 1,
                total_pages: trendingData.total_pages || 1,
                total_results: trendingData.total_results || 0
            });
        } catch (error) {
            console.error("TMDB trending error:", error);
            return NextResponse.json({ error: "TMDB trending failed", details: error.message }, { status: 500 });
        }
    }

    const page = parseInt(searchParams.get("page")) || 1;
    const upcomingUrl = `https://api.themoviedb.org/3/movie/upcoming?api_key=${TMDB_API_KEY}&language=en-US&page=${page}`;

    try {
        const upcomingResponse = await fetch(upcomingUrl);

        if (!upcomingResponse.ok) {
            return NextResponse.json({ error: "TMDB upcoming movies error", details: await upcomingResponse.text() }, { status: 500 });
        }

        const upcomingData = await upcomingResponse.json();
        const results = (upcomingData.results || []).slice(0, 20).map(movie => ({
            id: movie.id,
            title: movie.title,
            name: movie.title,
            overview: movie.overview,
            posterPath: movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : "/placeholder-movie.png",
            backdropPath: movie.backdrop_path ? `https://image.tmdb.org/t/p/original${movie.backdrop_path}` : "",
            releaseDate: movie.release_date,
            voteAverage: movie.vote_average,
            genreIds: movie.genre_ids || [],
            media_type: "movie"
        }));

        return NextResponse.json({
            results,
            page: upcomingData.page || 1,
            total_pages: upcomingData.total_pages || 1,
            total_results: upcomingData.total_results || 0
        });
    } catch (error) {
        console.error("TMDB API error:", error);
        return NextResponse.json({ error: "TMDB API failed", details: error.message }, { status: 500 });
    }
}
