import { NextResponse } from "next/server";
import dbConnect from "@/utils/db";
import User from "@/models/user";

export async function GET(request, { params }) {
    try {
        const { username } = await params;
        const type = new URL(request.url).searchParams.get("type") || "followers";

        await dbConnect();
        const user = await User.findOne({ username }).select("followers following").lean();
        if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        const usernames = type === "following" ? (user.following || []) : (user.followers || []);
        if (usernames.length === 0) {
            return NextResponse.json({ users: [] });
        }

        const users = await User.find({ username: { $in: usernames } })
            .select("username avatarColor avatarUrl isVerified isAdmin roles")
            .populate("roles", "name badge color")
            .lean();

        return NextResponse.json({ users });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
    }
}
