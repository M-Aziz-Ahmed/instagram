import MediaVaultPanel from "@/components/Settings/MediaVaultPanel";
import AccountSettingsShell from "@/components/Settings/AccountSettingsShell";

export const metadata = {
    title: "Settings - AnonTweet",
    robots: { index: false, follow: false },
};

/**
 * The user's own settings surface.
 *
 * There was no `/settings` route at all before this — account options were
 * reachable only through modals on the profile page. This exists so the media
 * vault has somewhere real to live, and because a link that says "manage your
 * storage" has to go somewhere.
 */
export default function SettingsPage() {
    return (
        <AccountSettingsShell>
            <MediaVaultPanel />
        </AccountSettingsShell>
    );
}
