import CheckersGameNoSSR from "@/components/Checkers/CheckersGameNoSSR";

export const metadata = {
    title: "Checkers Game - AnonFeed",
    description: "Play Checkers",
};

export default async function CheckersGamePage({ params }) {
    const { id } = await params;
    return <CheckersGameNoSSR gameId={id} />;
}
