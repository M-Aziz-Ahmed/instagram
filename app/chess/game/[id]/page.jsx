import ChessGameNoSSR from "@/components/Chess/ChessGameNoSSR";

export const metadata = {
    title: "Chess Game - AnonFeed",
    description: "Play chess",
};

export default async function ChessGamePage({ params }) {
    const { id } = await params;
    return <ChessGameNoSSR gameId={id} />;
}
