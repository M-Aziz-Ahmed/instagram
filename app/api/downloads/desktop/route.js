import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export const dynamic = "force-dynamic";

const DESKTOP_DIR = path.join(process.cwd(), "public", "downloads", "desktop");

const MIME = {
    ".exe": "application/vnd.microsoft.portable-executable",
    ".msi": "application/x-msi",
    ".sig": "text/plain",
};

export async function GET() {
    try {
        // Resolve the downloadable Windows installer from the update manifest.
        let file = "";
        try {
            const manifest = JSON.parse(
                await fs.readFile(path.join(DESKTOP_DIR, "latest.json"), "utf8")
            );
            const url = manifest?.platforms?.["windows-x86_64"]?.url || "";
            if (url) file = path.basename(new URL(url).pathname);
        } catch {}

        // Fall back to whichever setup.exe exists in the folder.
        if (!file) {
            const entries = await fs.readdir(DESKTOP_DIR);
            file = entries.find((e) => /x64-setup\.exe$/i.test(e)) || "";
        }
        if (!file) {
            return NextResponse.json({ error: "No desktop installer published" }, { status: 404 });
        }

        const filePath = path.join(DESKTOP_DIR, file);
        const stat = await fs.stat(filePath);
        const body = await fs.readFile(filePath);

        const ext = path.extname(file).toLowerCase();
        const headers = new Headers({
            "Content-Type": MIME[ext] || "application/octet-stream",
            "Content-Length": String(stat.size),
            "Content-Disposition": `attachment; filename="${file}"`,
            "Cache-Control": "public, max-age=3600",
        });

        return new Response(body, { status: 200, headers });
    } catch (error) {
        console.error("desktop download error:", error);
        return NextResponse.json(
            { error: "Failed to serve installer", detail: String(error?.message || error) },
            { status: 500 }
        );
    }
}
