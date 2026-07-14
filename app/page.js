import FeedNoSSR from "@/components/Feed/FeedNoSSR";

export const metadata = {
  title: 'Home Feed',
  description: 'Discover anonymous posts, stories, and content from users around the world. Share your thoughts freely without revealing your identity.',
  openGraph: {
    title: 'AnonFeed - Anonymous Social Media',
    description: 'Discover anonymous posts and stories from users worldwide',
  },
};

export default function Home() {
    return <FeedNoSSR />;
}
