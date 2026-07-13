import ProfileNoSSR from "@/components/Profile/ProfileNoSSR";

export default async function ProfilePage({ params }) {
    const { username } = await params;
    return <ProfileNoSSR username={decodeURIComponent(username)} />;
}