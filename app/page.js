import FeedClient from "@/components/Feed/FeedClient";

export const metadata = {
  title: 'Home Feed',
  description: 'Discover anonymous posts, stories, and content from users around the world. Share your thoughts freely without revealing your identity.',
  openGraph: {
    title: 'AnonTweet - Anonymous Social Media',
    description: 'Discover anonymous posts and stories from users worldwide',
  },
};

export default function Home() {
    return <FeedClient />;
}