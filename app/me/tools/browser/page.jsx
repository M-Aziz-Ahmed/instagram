import BrowserClient from "@/components/Browser/BrowserClient";

export const metadata = {
    title: "Browser",
    description: "Browse the web inside AnonTweet.",
    robots: { index: false, follow: false },
};

export default function BrowserPage() {
    return <BrowserClient />;
}
