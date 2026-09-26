import SavedNoSSR from "@/components/Me/SavedNoSSR";

export const metadata = {
    title: "Saved",
    description: "Everything you saved on AnonTweet: posts, anime and manga.",
    robots: { index: false, follow: true },
};

export default async function SavedPage({ searchParams }) {
    const resolved = searchParams instanceof Promise ? await searchParams : searchParams;
    const tab = resolved?.tab === "media" ? "media" : "posts";

    return <SavedNoSSR initialTab={tab} />;
}
