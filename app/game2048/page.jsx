import Game2048NoSSR from "@/components/Game2048/Game2048NoSSR";

export const metadata = {
    title: "2048 - AnonTweet",
    description: "Slide and merge tiles to reach 2048 in this classic single-player puzzle game.",
};

export default function Game2048Page() {
    return <Game2048NoSSR />;
}
