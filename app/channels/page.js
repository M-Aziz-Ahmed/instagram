import { redirectToHubTab } from "@/components/Media/redirectToHubTab";

// Merged into the Movie Hub. Kept as a route so existing links, bookmarks and
// the sidebar/bottom-nav entries keep resolving to the right category.
export default async function LegacyCategory({ searchParams }) {
    return redirectToHubTab("live-tv", searchParams);
}