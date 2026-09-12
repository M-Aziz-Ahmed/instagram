import FeedClient from "@/components/Feed/FeedClient";

export const metadata = {
  title: 'Social',
  description: 'Discover anonymous posts, stories, and content from users around the world. Share your thoughts freely without revealing your identity.',
  openGraph: {
    title: 'AnonTweet - Anonymous Social Media',
    description: 'Discover anonymous posts and stories from users worldwide',
  },
};

export default function Social() {
    return <FeedClient />;
}