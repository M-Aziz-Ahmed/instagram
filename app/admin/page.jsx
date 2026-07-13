import { redirect } from "next/navigation";
import { getSession } from "@/utils/session";
import connectDB from "@/utils/db";
import User from "@/models/user";
import AdminNoSSR from "@/components/Admin/AdminNoSSR";

export default async function AdminPage() {
    const session = await getSession();
    if (!session?.userId) redirect("/login");

    await connectDB();
    const user = await User.findById(session.userId).select("isAdmin").lean();
    if (!user?.isAdmin) redirect("/");

    return <AdminNoSSR />;
}
