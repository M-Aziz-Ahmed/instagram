"use client";

import dynamic from "next/dynamic";

const PostDetailClient = dynamic(() => import("./PostDetailClient"), {
    ssr: false,
    loading: () => (
        <div className="min-h-dvh bg-white dark:bg-gray-950 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-gray-300 dark:border-gray-700 border-t-gray-600 dark:border-t-gray-400 rounded-full animate-spin" />
        </div>
    ),
});

export default function PostDetailNoSSR({ postId }) {
    return <PostDetailClient postId={postId} />;
}
