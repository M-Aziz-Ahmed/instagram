import { NextResponse } from "next/server";
import dbConnect from "@/utils/db";
import User from "@/models/user";

export async function POST(request, { params }) {
    try {
        await dbConnect();
        const { id: postId } = await params;
        const { username } = await request.json();

        if (!username) {
            return NextResponse.json({ error: "Missing username" }, { status: 400 });
        }

        const user = await User.findOne({ username });
        if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        const isBookmarked = user.bookmarks.includes(postId);

        if (isBookmarked) {
            user.bookmarks = user.bookmarks.filter((id) => id !== postId);
        } else {
            user.bookmarks.push(postId);
        }

        await user.save();

        return NextResponse.json({ bookmarked: !isBookmarked });
    } catch (error) {
        console.error("Bookmark error:", error);
        return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
}
