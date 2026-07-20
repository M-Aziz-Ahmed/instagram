import HangmanGameNoSSR from "@/components/Hangman/HangmanGameNoSSR";

export const metadata = {
    title: "Hangman Game - AnonTweet",
    description: "Play Hangman",
};

export default async function HangmanGamePage({ params }) {
    const { id } = await params;
    return <HangmanGameNoSSR gameId={id} />;
}
