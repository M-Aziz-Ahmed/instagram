import BookmarksNoSSR from "@/components/Feed/BookmarksNoSSR";

export const metadata = {
  title: 'Bookmarks',
  description: 'View your saved posts and content on AnonTweet. Keep track of anonymous posts you want to revisit.',
  openGraph: {
    title: 'Your Bookmarks - AnonTweet',
    description: 'Your saved anonymous posts and content',
  },
  robots: {
    index: false, // Don't index personal bookmarks
    follow: true,
  },
};

export default function BookmarksPage() {
    return <BookmarksNoSSR />;
}
