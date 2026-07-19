import BattleshipGameNoSSR from "@/components/Battleship/BattleshipGameNoSSR";

export const metadata = {
    title: "Battleship Game - AnonFeed",
    description: "Play Battleship",
};

export default async function BattleshipGamePage({ params }) {
    const { id } = await params;
    return <BattleshipGameNoSSR gameId={id} />;
}
