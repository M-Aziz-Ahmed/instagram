import connectDB from "@/utils/db";
import LiveStream from "@/models/liveStream";
import User from "@/models/user";
import Notification from "@/models/notification";
import { sendPushNotification } from "@/utils/pushNotifications";

export async function POST(request) {
    try {
        const { username, title } = await request.json();
        if (!username) {
            return Response.json({ error: "Username required" }, { status: 400 });
        }

        await connectDB();

        const existing = await LiveStream.findOne({ host: username, status: "live" });
        if (existing) {
            return Response.json({ streamId: existing._id, message: "Already live" });
        }

        const hostUser = await User.findOne({ username }).lean();
        if (!hostUser?.isAdmin && !hostUser?.liveStreamAllowed) {
            return Response.json({ error: "You are not allowed to go live. Contact an admin." }, { status: 403 });
        }

        const stream = await LiveStream.create({
            host: username,
            title: title || "",
            status: "live",
        });

        if (hostUser?.followers?.length) {
            const notifs = hostUser.followers.map((follower) => ({
                recipient: follower,
                type: "live",
                fromUser: username,
                fromColor: hostUser.avatarColor || "#3b82f6",
                fromAvatarUrl: hostUser.avatarUrl || "",
                text: title || "is live now",
            }));
            await Notification.insertMany(notifs).catch(() => {});

            hostUser.followers.forEach((follower) => {
                sendPushNotification({
                    recipientUsername: follower,
                    type: "live",
                    fromUser: username,
                    text: title || "is live now",
                }).catch(() => {});
            });
        }

        return Response.json({ streamId: stream._id, title: stream.title });
    } catch (error) {
        console.error(error);
        return Response.json({ error: "Failed to start stream" }, { status: 500 });
    }
}

export async function GET() {
    try {
        await connectDB();
        const streams = await LiveStream.find({ status: "live" })
            .sort({ startedAt: -1 })
            .limit(20)
            .lean();

        const hostNames = [...new Set(streams.map((s) => s.host))];
        const hosts = await User.find({ username: { $in: hostNames } })
            .select("username avatarUrl avatarColor")
            .lean();
        const hostMap = {};
        hosts.forEach((h) => { hostMap[h.username] = h; });

        const enriched = streams.map((s) => {
            const u = hostMap[s.host] || {};
            return {
                ...s,
                hostAvatarUrl: u.avatarUrl || "",
                hostAvatarColor: u.avatarColor || "#3b82f6",
            };
        });

        return Response.json({ streams: enriched });
    } catch (error) {
        console.error(error);
        return Response.json({ error: "Failed to fetch streams" }, { status: 500 });
    }
}
