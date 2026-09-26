import { Suspense } from "react";
import MovieHub from "@/components/Media/MovieHub";

export const dynamic = "force-dynamic";

export const metadata = {
    title: "Movie Hub - AnonTweet",
    description:
        "Stream movies, series, K-dramas, C-dramas, cartoons, anime and live TV in one place.",
};

export default function WatchPage() {
    return (
        <Suspense fallback={<div className="min-h-dvh app-bg" />}>
            <MovieHub />
        </Suspense>
    );
}
