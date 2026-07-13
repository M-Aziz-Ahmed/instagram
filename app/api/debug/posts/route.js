import { NextResponse } from "next/server";
import connectDB from "@/utils/db";
import Post from "@/models/post";

export async function GET() {
    try {
        await connectDB();
        const posts = await Post.find({}).limit(5).lean();
        return NextResponse.json({ ok: true, count: posts.length, sample: posts.slice(0, 5) });
    } catch (err) {
        console.error("/api/debug/posts error:", err);
        return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
    }
}
