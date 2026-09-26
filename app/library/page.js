import { redirect } from "next/navigation";

export const metadata = {
    title: "My Library",
    robots: { index: false, follow: true },
};

/**
 * Saved anime and manga now live in the "Anime & Manga" tab of `/me/saved`.
 * This route stays so old bookmarks and shared links keep resolving.
 */
export default function Page() {
    redirect("/me/saved?tab=media");
}
