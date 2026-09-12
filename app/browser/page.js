import BrowserClient from "@/components/Browser/BrowserClient";

export const metadata = {
    title: "Browser",
    description: "Browse the web inside AnonTweet — a full in-app browser with tabs, history and a proxy that renders framed-out sites.",
};

export default function BrowserPage() {
    return <BrowserClient />;
}