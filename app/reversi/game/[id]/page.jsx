import ReversiGameNoSSR from "@/components/Reversi/ReversiGameNoSSR";

export const metadata = {
    title: "Reversi Game - AnonFeed",
    description: "Play Reversi",
};

export default async function ReversiGamePage({ params }) {
    const { id } = await params;
    return <ReversiGameNoSSR gameId={id} />;
}
