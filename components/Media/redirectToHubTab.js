import { redirect } from "next/navigation";

/**
 * Legacy category routes → Movie Hub.
 *
 * `/movies`, `/kdramas`, `/cartoons` etc. were separate pages before the hub
 * existed, and they are linked from the sidebar, the bottom nav, old bookmarks
 * and shared URLs. Rather than 404 them or keep duplicate pages alive, each one
 * forwards to the hub with the tab preselected.
 *
 * `id` and `ep` are carried across so a shared "watch episode 4" link still
 * lands on the right episode instead of the category's front page.
 */
export async function redirectToHubTab(tab, searchParams) {
    const resolved = searchParams instanceof Promise ? await searchParams : searchParams;
    const params = new URLSearchParams();
    params.set("tab", tab);
    for (const key of ["id", "ep"]) {
        const value = resolved?.[key];
        if (typeof value === "string" && value) params.set(key, value);
    }
    redirect(`/watch?${params.toString()}`);
}
