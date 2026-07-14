import SearchNoSSR from "@/components/SearchNoSSR";

export const metadata = {
  title: 'Search',
  description: 'Search for users, posts, and hashtags on AnonFeed. Discover anonymous content and connect with others.',
  openGraph: {
    title: 'Search AnonFeed',
    description: 'Discover anonymous content and users',
  },
};

export default function SearchPage() {
    return <SearchNoSSR />;
}
