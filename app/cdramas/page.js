import { Suspense } from "react";
import MediaPage from "@/components/Media/MediaPage";
import { MediaSource, getMediaSource } from "@/live-server/utils/mediaSources";

export const dynamic = "force-dynamic";

const mediaType = "cdrama";
const config = getMediaSource(mediaType);

export const metadata = {
  title: `${config.emoji} ${config.label} - AnonTweet`,
  description: `Watch ${config.label.toLowerCase()} for free on AnonTweet`,
};

export default function CDramas() {
  return (
    <Suspense>
      <MediaPage mediaType={mediaType} config={config} />
    </Suspense>
  );
}