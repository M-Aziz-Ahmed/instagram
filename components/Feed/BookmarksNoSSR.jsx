"use client";

import dynamic from "next/dynamic";

const BookmarksClient = dynamic(() => import("./BookmarksClient"), { ssr: false });

export default function BookmarksNoSSR() {
    return <BookmarksClient />;
}
