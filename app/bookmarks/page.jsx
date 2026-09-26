import { redirect } from "next/navigation";

export const metadata = {
    title: "Saved posts",
    robots: { index: false, follow: true },
};

/**
 * Saved posts now live in the "Posts" tab of `/me/saved`, alongside saved
 * anime and manga. This route stays so old bookmarks, shared links and the
 * sitemap entry keep resolving.
 */
export default function BookmarksPage() {
    redirect("/me/saved?tab=posts");
}
