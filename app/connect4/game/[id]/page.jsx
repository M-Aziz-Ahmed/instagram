import Connect4GameNoSSR from "@/components/Connect4/Connect4GameNoSSR";

export const metadata = {
    title: "Connect Four Game - AnonTweet",
    description: "Play Connect Four",
};

export default async function Connect4GamePage({ params }) {
    const { id } = await params;
    return <Connect4GameNoSSR gameId={id} />;
}
