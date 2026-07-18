import PostDetailNoSSR from "@/components/Feed/PostDetailNoSSR";

export const metadata = { title: "Post" };

export default async function PostPage({ params }) {
    const { id } = await params;
    return <PostDetailNoSSR postId={decodeURIComponent(id)} />;
}
