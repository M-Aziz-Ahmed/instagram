import PostDetailNoSSR from "@/components/Feed/PostDetailNoSSR";

const SITE_URL = "https://anontweet.duckdns.org";
const SITE_NAME = "AnonFeed";

export async function generateMetadata({ params }) {
    const { id } = await params;
    try {
        const res = await fetch(`${SITE_URL}/api/posts/${id}`, { next: { revalidate: 60 } });
        if (!res.ok) return { title: `Post | ${SITE_NAME}` };
        const post = await res.json();

        const author = post.sender || "Anonymous";
        const description = post.text?.slice(0, 200)?.trim() || "Check out this post on AnonFeed";
        const postUrl = `${SITE_URL}/post/${id}`;
        const authorAvatar = post._author?.avatarUrl || post.avatarUrl || "";

        const reactionCount = Object.values(post.reactions || {}).reduce((sum, arr) => sum + (arr?.length || 0), 0);
        const engagement = [];
        if (post.likes?.length || reactionCount > 0) engagement.push(`${post.likes?.length || reactionCount} reactions`);
        if (post.comments?.length) engagement.push(`${post.comments.length} comments`);
        if (post.viewCount) engagement.push(`${post.viewCount} views`);
        const metaDescription = engagement.length > 0
            ? `${description} — ${engagement.join(", ")}`
            : description;

        const images = [];
        if (post.imageUrl) {
            images.push({ url: post.imageUrl, width: 1200, height: 630, alt: `Post by ${author}` });
        } else if (authorAvatar) {
            images.push({ url: authorAvatar, width: 200, height: 200, alt: `${author}'s avatar`, type: "image/jpeg" });
        }

        return {
            title: `${author} on ${SITE_NAME}`,
            description: metaDescription,
            authors: [author],
            openGraph: {
                title: `${author} on ${SITE_NAME}`,
                description: metaDescription,
                url: postUrl,
                siteName: SITE_NAME,
                images,
                type: "article",
                publishedTime: post.timeStamp || undefined,
                authors: [author],
                ...(post.reactions && {
                    taggedProfile: [author],
                }),
            },
            twitter: {
                card: post.imageUrl ? "summary_large_image" : "summary",
                title: `${author} on ${SITE_NAME}`,
                description: metaDescription,
                images: images.map((img) => img.url),
                creator: `@${author}`,
                site: `@${SITE_NAME}`,
            },
            other: {
                "theme-color": "#3b82f6",
                "apple-mobile-web-app-capable": "yes",
                "apple-mobile-web-app-status-bar-style": "black-translucent",
            },
        };
    } catch {
        return { title: `Post | ${SITE_NAME}` };
    }
}

export default async function PostPage({ params }) {
    const { id } = await params;
    return <PostDetailNoSSR postId={decodeURIComponent(id)} />;
}
