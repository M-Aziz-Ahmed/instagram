"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

export default function CommunityChannelClient() {
    const { id } = useParams();
    const router = useRouter();

    // Redirect to community page since channels no longer exist
    useEffect(() => {
        router.replace(`/communities/${id}`);
    }, [id, router]);

    return null;
}
