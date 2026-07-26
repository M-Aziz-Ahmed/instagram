import { Suspense } from "react";
import CommunityChannelClient from "@/components/Communities/CommunityChannelClient";

export const metadata = {
    title: "Channel",
    description: "Community channel on AnonTweet",
};

export default function CommunityChannelPage() {
    return (
        <Suspense>
            <CommunityChannelClient />
        </Suspense>
    );
}
