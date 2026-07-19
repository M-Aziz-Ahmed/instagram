import InviteLandingNoSSR from "@/components/Auth/InviteLandingNoSSR";

export async function generateMetadata({ params }) {
    const { code } = await params;
    return {
        title: `Join AnonFeed with invite code ${code}`,
        description: "You've been invited to join AnonFeed! Enter this invite code to create your account.",
        openGraph: {
            title: "Join AnonFeed",
            description: "You've been invited to join AnonFeed!",
            type: "website",
        },
    };
}

export default async function InvitePage({ params }) {
    const { code } = await params;
    return <InviteLandingNoSSR inviteCode={decodeURIComponent(code)} />;
}
