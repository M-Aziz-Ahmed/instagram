import HangmanNoSSR from "@/components/Hangman/HangmanNoSSR";

export const metadata = {
    title: "Hangman - AnonFeed",
    description: "Guess the word before the drawing completes",
};

export default function HangmanPage() {
    return <HangmanNoSSR />;
}
