import ProfileNoSSR from "@/components/ProfileNoSSR";

export const metadata = {
  title: 'Profile',
  description: 'View and edit your anonymous profile on AnonFeed. Manage your posts, stories, and account settings.',
  robots: {
    index: false, // Don't index personal profiles
    follow: true,
  },
};

export default function ProfilePage() {
    return <ProfileNoSSR />;
}
