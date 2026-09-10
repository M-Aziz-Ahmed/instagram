// Desktop download discovery — shared by the /download page and the banner.
//
// Available binaries are advertised in public/downloads/desktop/available.json
// (written by the CI merge step). The updater (latest.json) only carries signed,
// auto-update-ready platforms; available.json additionally exposes unsigned
// builds for manual download, so Linux/macOS options appear even before signing
// secrets are configured.

const AVAILABLE_JSON = "/downloads/desktop/available.json";
const HOST = "https://anontweet.vercel.app/downloads/desktop";

export function detectPlatform() {
    if (typeof window === "undefined") return "unknown";
    const inTauri = "__TAURI_INTERNALS__" in window;
    if (inTauri) return "tauri";
    const ua = navigator.userAgent;
    if (/Windows/i.test(ua)) return "windows";
    if (/Mac OS X|iPad|iPhone/i.test(ua)) return "macos";
    if (/Android/i.test(ua)) return "android";
    if (/Linux/i.test(ua)) return "linux";
    return "unknown";
}

function isArm() {
    if (typeof navigator === "undefined") return false;
    return /arm64|aarch64/i.test(navigator.userAgent);
}

export async function fetchAvailableFiles() {
    try {
        const r = await fetch(AVAILABLE_JSON);
        if (!r.ok) return null;
        return await r.json();
    } catch {
        return null;
    }
}

// Files the artifact listing exposes per platform key.
export function filesFor(available, platform) {
    const files = available?.files;
    if (!files) return [];
    const keys =
        platform === "windows"
            ? ["windows-x86_64"]
            : platform === "linux"
              ? ["linux-x86_64"]
              : platform === "macos"
                ? ["darwin-aarch64", "darwin-x86_64"]
                : [];
    return keys.flatMap((k) => files[k] || []);
}

// Best direct-download URL for the current browser's platform.
export function bestDownloadUrl(available, platform) {
    const files = filesFor(available, platform);
    if (files.length === 0) return "";
    if (platform === "windows") {
        return `${HOST}/${files.find((f) => f.endsWith("-setup.exe")) || files[0]}`;
    }
    if (platform === "linux") {
        return `${HOST}/${files.find((f) => /\.appimage$/i.test(f)) || files[0]}`;
    }
    // macOS: prefer the dmg matching this machine's architecture.
    const prefer = isArm() ? "_aarch64.dmg" : "_x64.dmg";
    const pick =
        files.find((f) => f.endsWith(prefer)) ||
        files.find((f) => /\.dmg$/i.test(f)) ||
        files[0];
    return `${HOST}/${pick}`;
}