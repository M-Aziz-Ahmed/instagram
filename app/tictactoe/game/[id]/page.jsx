import TicTacToeGameNoSSR from "@/components/TicTacToe/TicTacToeGameNoSSR";

export const metadata = {
    title: "Tic-Tac-Toe Game - AnonTweet",
    description: "Play Tic-Tac-Toe",
};

export default async function TicTacToeGamePage({ params }) {
    const { id } = await params;
    return <TicTacToeGameNoSSR gameId={id} />;
}
