import { Suspense } from "react";
import MangaPage from "@/components/Manga/MangaPage";

export const metadata = {
  title: "Manga - AnonTweet",
  description: "Read manga for free on AnonTweet",
};

export default function Manga() {
  return (
    <Suspense>
      <MangaPage />
    </Suspense>
  );
}
