import BlockedAccounts from "@/components/Settings/BlockedAccounts";

export const metadata = {
    title: "Muted & blocked accounts",
    robots: { index: false, follow: false },
};

export default function BlockedAccountsPage() {
    return <BlockedAccounts mutedWords={0} />;
}
