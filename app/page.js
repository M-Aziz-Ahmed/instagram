import dynamic from "next/dynamic";
import { metadata as feedMetadata } from "@/components/Feed/Feed";

const FeedDynamic = dynamic(() => import("@/components/Feed/Feed"), {
    ssr: false,
    loading: () => (
        <div className="flex h-dvh items-center justify-center bg-white dark:bg-gray-950">
            <div className="w-6 h-6 border-2 border-gray-300 dark:border-gray-700 border-t-gray-600 dark:border-t-gray-400 rounded-full animate-spin" />
        </div>
    ),
});

export const metadata = {
  title: feedMetadata?.title || 'Home Feed',
  description: feedMetadata?.description || 'Discover anonymous posts, stories, and content from users around the world. Share your thoughts freely without revealing your identity.',
  openGraph: {
    title: 'AnonTweet - Anonymous Social Media',
    description: 'Discover anonymous posts and stories from users worldwide',
  },
};

export default function Home() {
    return <FeedDynamic />;
}
