import { Suspense } from "react";
import LiveTVPage from "@/components/LiveTV/LiveTVPage";

export const metadata = {
  title: "📺 Live TV - AnonTweet",
  description: "Watch live TV channels for free on AnonTweet",
};

export default function LiveTV() {
  return (
    <Suspense>
      <LiveTVPage />
    </Suspense>
  );
}