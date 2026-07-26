import { Suspense } from "react";
import CommunitiesClient from "@/components/Communities/CommunitiesClient";

export const metadata = {
    title: "Communities",
    description: "Browse and join communities on AnonTweet",
};

export default function CommunitiesPage() {
    return (
        <Suspense>
            <CommunitiesClient />
        </Suspense>
    );
}
