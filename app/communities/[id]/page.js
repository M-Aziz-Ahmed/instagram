import { Suspense } from "react";
import CommunityDetailClient from "@/components/Communities/CommunityDetailClient";

export const metadata = {
    title: "Community",
    description: "Community page on AnonTweet",
};

export default function CommunityDetailPage() {
    return (
        <Suspense>
            <CommunityDetailClient />
        </Suspense>
    );
}
