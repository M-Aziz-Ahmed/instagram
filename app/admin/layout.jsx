import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import { getSession } from "@/utils/session";

const LIVE_SERVER_URL = (
    process.env.NEXT_PUBLIC_LIVE_SERVER_URL || "http://localhost:3001"
).replace(/\/$/, "");

export const dynamic = "force-dynamic";

const NAV = [
    { href: "/admin", label: "Dashboard", icon: "📊" },
    { href: "/admin/analytics", label: "Analytics", icon: "📈" },
    { href: "/admin/manage", label: "Manage", icon: "🛠" },
];

export default async function AdminLayout({ children }) {
    const session = await getSession();
    if (!session?.userId) redirect("/login");

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

    return (
        <div className="min-h-dvh bg-gray-50 dark:bg-gray-950">
            <header className="sticky top-0 z-20 bg-white/90 dark:bg-gray-950/90 backdrop-blur border-b border-gray-200 dark:border-gray-800 safe-top">
                <div className="max-w-6xl mx-auto px-3 sm:px-6">
                    <div className="h-12 sm:h-14 flex items-center gap-3">
                        <span className="font-extrabold text-base text-gray-900 dark:text-gray-100">
                            <span className="text-[#58cc02]">Admin</span>
                        </span>
                        <nav className="flex-1 flex items-center gap-1 overflow-x-auto">
                            {NAV.map((n) => (
                                <Link
                                    key={n.href}
                                    href={n.href}
                                    className="px-3 py-1.5 rounded-lg text-sm font-semibold whitespace-nowrap text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
                                >
                                    <span className="mr-1">{n.icon}</span>
                                    {n.label}
                                </Link>
                            ))}
                        </nav>
                    </div>
                </div>
            </header>
            <main className="max-w-6xl mx-auto px-3 sm:px-6 py-6">{children}</main>
        </div>
    );
}