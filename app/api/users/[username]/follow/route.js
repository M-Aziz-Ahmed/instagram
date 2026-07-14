import { NextResponse } from "next/server";
import dbConnect from "@/utils/db";
import User from "@/models/user";

export async function POST(request, { params }) {
    try {
        await dbConnect();
        const { username: targetUsername } = await params;
        const { username: currentUsername } = await request.json();

        if (!currentUsername || !targetUsername) {
            return NextResponse.json({ error: "Missing username" }, { status: 400 });
        }
        if (currentUsername === targetUsername) {
            return NextResponse.json({ error: "Cannot follow yourself" }, { status: 400 });
        }

        const [currentUser, targetUser] = await Promise.all([
            User.findOne({ username: currentUsername }),
            User.findOne({ username: targetUsername }),
        ]);

        if (!currentUser || !targetUser) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        const isFollowing = currentUser.following.includes(targetUsername);

        if (isFollowing) {
            // Unfollow
            currentUser.following = currentUser.following.filter((u) => u !== targetUsername);
            targetUser.followers = targetUser.followers.filter((u) => u !== currentUsername);
        } else {
            // Follow
            currentUser.following.push(targetUsername);
            targetUser.followers.push(currentUsername);
        }

        await Promise.all([currentUser.save(), targetUser.save()]);

        return NextResponse.json({
            following: !isFollowing,
            followersCount: targetUser.followers.length,
            followingCount: targetUser.following.length,
        });
    } catch (error) {
        console.error("Follow error:", error);
        return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
}
