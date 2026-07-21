import MediaBookmarksPage from "@/components/MediaBookmarks/MediaBookmarksPage";

export const metadata = {
  title: 'My Library - AnonTweet',
  description: 'Your bookmarked anime and manga. Track your reading and watching history.',
  robots: { index: false, follow: true },
};

export default function Page() {
    return <MediaBookmarksPage />;
}
