import InviteLandingNoSSR from "@/components/Auth/InviteLandingNoSSR";

export async function generateMetadata({ params }) {
    const { code } = await params;
    return {
        title: `Join AnonTweet with invite code ${code}`,
        description: "You've been invited to join AnonTweet! Enter this invite code to create your account.",
        openGraph: {
            title: "Join AnonTweet",
            description: "You've been invited to join AnonTweet!",
            type: "website",
        },
    };
}

export default async function InvitePage({ params }) {
    const { code } = await params;
    return <InviteLandingNoSSR inviteCode={decodeURIComponent(code)} />;
}
