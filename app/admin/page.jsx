import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getSession } from "@/utils/session";

const LIVE_SERVER_URL = (
    process.env.NEXT_PUBLIC_LIVE_SERVER_URL || "http://localhost:3001"
).replace(/\/$/, "");

export default async function AdminPage() {
    const session = await getSession();
    if (!session?.userId) redirect("/login");

    // Verify admin status via the live-server (which owns the DB connection).
    let isAdmin = false;
    try {
        const cookieStore = await cookies();
        const res = await fetch(`${LIVE_SERVER_URL}/api/auth/me`, {
            headers: { cookie: cookieStore.toString() },
            cache: "no-store",
        });
        const data = await res.json();
        isAdmin = !!data?.user?.isAdmin;
    } catch {
        isAdmin = false;
    }

    if (!isAdmin) redirect("/");

    const AdminNoSSR = (await import("@/components/Admin/AdminNoSSR")).default;
    return <AdminNoSSR />;
}

