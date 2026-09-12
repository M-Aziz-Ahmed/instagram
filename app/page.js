import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export const metadata = {
  title: 'AnonTweet Messaging',
  description: 'Chat with friends, groups and communities on AnonTweet. Your super-app hub for messaging, social, browser and entertainment.',
};

export default async function Home() {
  const cookieStore = await cookies();
  redirect(cookieStore.has("af_session") ? "/inbox" : "/login");
}