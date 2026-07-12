"use client";

import dynamic from "next/dynamic";

const ProfileClient = dynamic(() => import("./ProfileClient"), {
    ssr: false,
    loading: () => (
        <div className="flex h-dvh items-center justify-center bg-white">
            <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
        </div>
    ),
});

export default function ProfileNoSSR({ username }) {
    return <ProfileClient username={username} />;
}
