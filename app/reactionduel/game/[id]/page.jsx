import ReactionDuelGameNoSSR from "@/components/ReactionDuel/ReactionDuelGameNoSSR";

export const metadata = {
    title: "Reaction Duel - AnonTweet",
    description: "Play Reaction Duel",
};

export default async function ReactionDuelGamePage({ params }) {
    const { id } = await params;
    return <ReactionDuelGameNoSSR gameId={id} />;
}
