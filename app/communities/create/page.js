import { Suspense } from "react";
import CreateCommunityClient from "@/components/Communities/CreateCommunityClient";

export const metadata = {
    title: "Create Community",
    description: "Create a new community on AnonTweet",
};

export default function CreateCommunityPage() {
    return (
        <Suspense>
            <CreateCommunityClient />
        </Suspense>
    );
}
