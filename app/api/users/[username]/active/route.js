import connectDB from "@/utils/db";
import User from "@/models/user";

// Update user's online status and lastActive timestamp
export async function POST(request, { params }) {
    try {
        const { username } = await params;
        const { isOnline } = await request.json();

        if (!username) {
            return Response.json({ error: "Username required" }, { status: 400 });
        }

        await connectDB();

        const update = {
            lastActive: new Date(),
            ...(typeof isOnline === 'boolean' && { isOnline }),
        };

        const user = await User.findOneAndUpdate(
            { username },
            { $set: update },
            { new: true, maxTimeMS: 5000 }
        ).select("username lastActive isOnline").lean();

        if (!user) {
            return Response.json({ error: "User not found" }, { status: 404 });
        }

        return Response.json({ 
            ok: true, 
            lastActive: user.lastActive,
            isOnline: user.isOnline 
        });
    } catch (error) {
        console.error("Failed to update user activity:", error);
        return Response.json({ error: "Failed to update activity" }, { status: 500 });
    }
}

// Get user's online status
export async function GET(request, { params }) {
    try {
        const { username } = await params;

        if (!username) {
            return Response.json({ error: "Username required" }, { status: 400 });
        }

        await connectDB();

        const user = await User.findOne({ username })
            .select("username lastActive isOnline")
            .lean()
            .maxTimeMS(5000);

        if (!user) {
            return Response.json({ error: "User not found" }, { status: 404 });
        }

        // Consider user online if:
        // 1. isOnline flag is true AND
        // 2. lastActive is within last 5 minutes
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        const isActive = user.isOnline && new Date(user.lastActive) > fiveMinutesAgo;

        return Response.json({
            username: user.username,
            isOnline: isActive,
            lastActive: user.lastActive,
        });
    } catch (error) {
        console.error("Failed to get user activity:", error);
        return Response.json({ error: "Failed to get activity" }, { status: 500 });
    }
}
