import { Suspense } from "react";
import MediaPage from "@/components/Media/MediaPage";
import { MediaSource, getMediaSource } from "@/live-server/utils/mediaSources";

const mediaType = "channel";
const config = getMediaSource(mediaType);

export const metadata = {
  title: `${config.emoji} ${config.label} - AnonTweet`,
  description: `Browse ${config.label.toLowerCase()} on AnonTweet`,
};

export default function Channels() {
  return (
    <Suspense>
      <MediaPage mediaType={mediaType} config={config} />
    </Suspense>
  );
}
