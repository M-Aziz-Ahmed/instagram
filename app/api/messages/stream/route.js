// Server-Sent Events endpoint — clients connect here for real-time messages
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Required for Vercel streaming support
export const maxDuration = 60;

if (!globalThis._sseClients) globalThis._sseClients = new Set();
const sseClients = globalThis._sseClients;

export async function GET() {
    let controller;
    let heartbeatInterval;

    const stream = new ReadableStream({
        start(c) {
            controller = c;
            sseClients.add(controller);
            // Initial connection confirmation
            controller.enqueue(new TextEncoder().encode(": connected\n\n"));

            // Heartbeat every 20s to keep the connection alive through proxies/Vercel
            heartbeatInterval = setInterval(() => {
                try {
                    controller.enqueue(new TextEncoder().encode(": heartbeat\n\n"));
                } catch {
                    clearInterval(heartbeatInterval);
                    sseClients.delete(controller);
                }
            }, 20000);
        },
        cancel() {
            clearInterval(heartbeatInterval);
            sseClients.delete(controller);
        },
    });

    return new Response(stream, {
        headers: {
            "Content-Type":      "text/event-stream",
            "Cache-Control":     "no-cache, no-transform",
            "Connection":        "keep-alive",
            "X-Accel-Buffering": "no",
        },
    });
}
