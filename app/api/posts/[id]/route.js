import connectDB from "@/utils/db";
import Post from "@/models/post";

// PATCH /api/posts/:id  — toggle like
export async function PATCH(request, { params }) {
    try {
        const { id } = await params;
        const { username } = await request.json();

        if (!username) {
            return Response.json({ error: "Username required" }, { status: 400 });
        }

        await connectDB();
        const post = await Post.findById(id);
        if (!post) return Response.json({ error: "Not found" }, { status: 404 });

        const idx = post.likes.indexOf(username);
        if (idx === -1) {
            post.likes.push(username);
        } else {
            post.likes.splice(idx, 1);
        }
        await post.save();

        return Response.json(post);
    } catch (error) {
        console.error(error);
        return Response.json({ error: "Failed to update like" }, { status: 500 });
    }
}

// DELETE /api/posts/:id
export async function DELETE(request, { params }) {
    try {
        const { id } = await params;
        const { username } = await request.json();

        await connectDB();
        const post = await Post.findById(id);
        if (!post) return Response.json({ error: "Not found" }, { status: 404 });
        if (post.sender !== username) {
            return Response.json({ error: "Unauthorized" }, { status: 403 });
        }

        await Post.findByIdAndDelete(id);
        return Response.json({ ok: true });
    } catch (error) {
        console.error(error);
        return Response.json({ error: "Failed to delete post" }, { status: 500 });
    }
}
