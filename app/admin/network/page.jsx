"use client";

import NetworkPage from "@/components/Admin/NetworkPage";

/**
 * Social graph & community health.
 *
 * Thin by design: the admin layout already owns the `max-w-6xl` container and
 * the sticky header, so this route only hands off to the panel. The real work
 * lives in components/Admin/NetworkPage.jsx.
 */
export default function AdminNetwork() {
    return <NetworkPage />;
}
