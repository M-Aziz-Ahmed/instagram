"use client";

// Thin route file, matching app/admin/analytics/page.jsx. The `max-w-6xl` and
// the sticky header come from app/admin/layout.jsx, so neither is repeated here.
import GamesPage from "@/components/Admin/GamesPage";

export default function AdminGames() {
    return <GamesPage />;
}
