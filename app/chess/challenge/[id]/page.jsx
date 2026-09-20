import ChessChallengeNoSSR from "@/components/Chess/ChessChallengeNoSSR";

export const metadata = {
    title: "Chess Challenge - AnonTweet",
    description: "Accept a chess challenge",
};

export default async function ChessChallengePage({ params }) {
    const { id } = await params;
    return <ChessChallengeNoSSR gameId={id} />;
}
