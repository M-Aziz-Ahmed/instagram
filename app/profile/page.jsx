import ProfileNoSSR from "@/components/Profile/ProfileNoSSR";

export const metadata = {
  title: 'Profile',
  description: 'View and edit your anonymous profile on AnonTweet. Manage your posts, stories, and account settings.',
  robots: {
    index: false, // Don't index personal profiles
    follow: true,
  },
};

export default function ProfilePage() {
    return <ProfileNoSSR />;
}
