import { redirect } from "next/navigation";

// The browser moved under Tools so it stops competing with the feed, chats and
// Learn for a top-level nav slot. Old links, bookmarks and the PWA start_url
// still point here, so redirect rather than 404.
export default function BrowserPage() {
    redirect("/me/tools/browser");
}
