import { NextResponse } from "next/server";
import dbConnect from "@/utils/db";
import User from "@/models/user";
import Notification from "@/models/notification";
import { sendPushNotification } from "@/utils/pushNotifications";

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
            // Follow - check for duplicates before adding
            if (!currentUser.following.includes(targetUsername)) {
                currentUser.following.push(targetUsername);
            }
            if (!targetUser.followers.includes(currentUsername)) {
                targetUser.followers.push(currentUsername);
            }

            // Notify target user + push
            Notification.create({
                recipient: targetUsername,
                type: "follow",
                fromUser: currentUsername,
                fromColor: currentUser.avatarColor || "#3b82f6",
                fromAvatarUrl: currentUser.avatarUrl || "",
                text: "",
            }).catch(() => {});

            sendPushNotification({
                recipientUsername: targetUsername,
                type: "follow",
                fromUser: currentUsername,
            }).catch(() => {});
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
