/**
 * Server-side check for the `use_browser` role permission.
 *
 * The in-app web browser lives in the Next.js layer (app/api/browser/route.js)
 * rather than in the live server, so it cannot use the express
 * `requirePermission` middleware. This asks the live server what the caller's
 * roles grant — see GET /api/users/me/permissions.
 *
 * The result is cached per-request only. It is deliberately not cached across
 * requests: a permission change has to take effect immediately, and a stale
 * grant on a proxy this powerful is exactly the bug worth avoiding.
 */

const LIVE_SERVER =
  process.env.NEXT_PUBLIC_LIVE_SERVER_URL ||
  process.env.LIVE_SERVER_URL ||
  "http://localhost:3001";

/**
 * @param {Request} request Incoming request, used to forward the session cookie.
 * @returns {Promise<boolean>} true when the caller may use the browser.
 */
export async function canUseBrowser(request) {
  try {
    const cookie = request.headers.get("cookie") || "";
    if (!cookie.includes("af_session=")) return false;

    const res = await fetch(`${LIVE_SERVER}/api/users/me/permissions`, {
      headers: { cookie },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return false;

    const data = await res.json();
    if (data?.isAdmin) return true;
    return Array.isArray(data?.permissions) && data.permissions.includes("use_browser");
  } catch {
    // Fail closed. If the live server is unreachable the proxy must not become
    // an open relay.
    return false;
  }
}
