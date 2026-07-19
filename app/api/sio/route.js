const LIVE_SERVER = process.env.NEXT_PUBLIC_LIVE_SERVER_URL || "https://anontweet.duckdns.org:3001";

async function proxyRequest(request) {
    const url = new URL(request.url);
    const targetUrl = `${LIVE_SERVER}/socket.io${url.search}`;

    const headers = {};
    const contentType = request.headers.get("content-type");
    if (contentType) headers["content-type"] = contentType;

    const fetchOptions = { method: request.method, headers };

    if (request.method === "POST") {
        fetchOptions.body = await request.arrayBuffer();
    }

    const res = await fetch(targetUrl, fetchOptions);
    const body = await res.arrayBuffer();

    return new Response(body, {
        status: res.status,
        headers: {
            "content-type": res.headers.get("content-type") || "application/octet-stream",
            "cache-control": "no-store",
        },
    });
}

export async function GET(request) {
    try {
        return await proxyRequest(request);
    } catch (e) {
        return new Response("Proxy error", { status: 502 });
    }
}

export async function POST(request) {
    try {
        return await proxyRequest(request);
    } catch (e) {
        return new Response("Proxy error", { status: 502 });
    }
}
