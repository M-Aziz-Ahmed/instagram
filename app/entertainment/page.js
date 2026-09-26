import { redirect } from "next/navigation";
import { isHubTab } from "@/components/Media/movieHubTabs";

export const metadata = {
    title: "Entertainment",
    description: "Movies, anime, manga, games and more — all your entertainment sub-apps in one place.",
};

/**
 * `/entertainment` used to be a landing page for the streaming sub-apps. All
 * of them now live inside the Movie Hub at `/watch`, so this route is nothing
 * but an extra hop. The sidebar, bottom nav and old bookmarks still point
 * here, and a shared `?tab=` deep link keeps working.
 */
export default async function EntertainmentPage({ searchParams }) {
    const resolved = searchParams instanceof Promise ? await searchParams : searchParams;
    const tab = resolved?.tab;

    redirect(isHubTab(tab) ? `/watch?tab=${tab}` : "/watch");
}
