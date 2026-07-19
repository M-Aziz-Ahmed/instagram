import connectDB from "@/utils/db";
import User from "@/models/user";
import { getSession } from "@/utils/session";

export async function PATCH(request) {
    try {
        const session = await getSession();
        if (!session?.userId) return Response.json({ error: "Not authenticated" }, { status: 401 });

        const { bio, avatarColor, avatarUrl, language, autoTranslate } = await request.json();
        await connectDB();

        const update = {
            bio:         bio?.trim() ?? "",
            avatarColor: avatarColor || "#3b82f6",
        };
        if (avatarUrl !== undefined) update.avatarUrl = avatarUrl;
        if (language) update.language = language;
        if (autoTranslate !== undefined) update.autoTranslate = autoTranslate;

        const user = await User.findByIdAndUpdate(session.userId, update, { returnDocument: 'after' })
            .populate("roles").lean();

        return Response.json({
            user: {
                id: user._id.toString(), email: user.email,
                username: user.username, bio: user.bio,
                avatarColor: user.avatarColor, avatarUrl: user.avatarUrl || "",
                isVerified: user.isVerified || false, isAdmin: user.isAdmin || false,
                roles: (user.roles || []).map((r) => ({ id: r._id.toString(), name: r.name, badge: r.badge, color: r.color })),
                language: user.language || "en",
                autoTranslate: user.autoTranslate || false,
                needsSetup: false,
            },
        });
    } catch (error) {
        console.error(error);
        return Response.json({ error: "Failed to update profile" }, { status: 500 });
    }
}
