import { Suspense } from "react";
import MediaPage from "@/components/Media/MediaPage";
import { MediaSource, getMediaSource } from "@/live-server/utils/mediaSources";

export const dynamic = "force-dynamic";

const mediaType = "live-tv";
const config = getMediaSource(mediaType);

export const metadata = {
  title: `${config.emoji} ${config.label} - AnonTweet`,
  description: `Watch live TV channels for free on AnonTweet`,
};

export default function LiveTV() {
  return (
    <Suspense>
      <MediaPage mediaType="live-tv" config={config} />
    </Suspense>
  );
}