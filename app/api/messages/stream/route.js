// Server-Sent Events endpoint — clients connect here for real-time messages
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

if (!globalThis._sseClients) globalThis._sseClients = new Set();
const sseClients = globalThis._sseClients;

export async function GET() {
    let controller;

    const stream = new ReadableStream({
        start(c) {
            controller = c;
            sseClients.add(controller);
            // Send a heartbeat comment so the connection stays alive
            controller.enqueue(new TextEncoder().encode(": connected\n\n"));
        },
        cancel() {
            sseClients.delete(controller);
        },
    });

    return new Response(stream, {
        headers: {
            "Content-Type":  "text/event-stream",
            "Cache-Control": "no-cache, no-transform",
            Connection:      "keep-alive",
            "X-Accel-Buffering": "no",
        },
    });
}
