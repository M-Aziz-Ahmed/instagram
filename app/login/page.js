import LoginNoSSR from "@/components/LoginNoSSR";

export const metadata = {
  title: 'Login',
  description: 'Sign in to AnonFeed - your anonymous social media platform. Connect and share without revealing your identity.',
  openGraph: {
    title: 'Login to AnonFeed',
    description: 'Sign in to your anonymous social media account',
  },
};

export default function LoginPage() {
    return <LoginNoSSR />;
}
