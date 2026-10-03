// Regenerate public/downloads/desktop/available.json from what is actually on disk.
//
// The CI merge step (tools/merge-updater-manifest.py) writes this file too, but only
// when it runs. A local Windows release through publish.ps1 updates latest.json and
// then prunes every installer from other versions - which left available.json
// advertising files that had just been deleted, so /download 404'd.
//
// Run: node tools/gen-available-json.mjs
import fs from "node:fs";
import path from "node:path";

const DIR = "public/downloads/desktop";
const HOST = "https://anontweet.vercel.app/downloads/desktop";

// Mirrors platform_for() in tools/merge-updater-manifest.py so both writers agree.
function platformFor(name) {
    const low = name.toLowerCase();
    if (low.includes("setup.exe") || low.endsWith(".msi")) return "windows-x86_64";
    if (low.endsWith(".appimage") || low.endsWith(".deb") || low.endsWith(".rpm")) {
        return low.includes("aarch64") || low.includes("arm64") ? "linux-arm64" : "linux-x86_64";
    }
    if (low.endsWith(".dmg") || low.includes(".app.tar.gz")) {
        return low.includes("aarch64") || low.includes("arm64") ? "darwin-aarch64" : "darwin-x86_64";
    }
    return null;
}

const files = fs.readdirSync(DIR, { withFileTypes: true });
const grouped = {};
const versions = [];

for (const entry of files) {
    if (!entry.isFile()) continue;
    const name = entry.name;
    const low = name.toLowerCase();
    if (!low.startsWith("anontweet") || low.endsWith(".sig")) continue;
    const key = platformFor(name);
    if (!key) continue;
    (grouped[key] ||= []).push(name);
    const m = /_(\d+\.\d+\.\d+)[_-]/.exec(name) || /-(\d+\.\d+\.\d+)-/.exec(name);
    if (m) versions.push(m[1]);
}

for (const key of Object.keys(grouped)) grouped[key].sort();
versions.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

// Newest version on disk wins. Fall back to the updater manifest so a release with
// only a .sig (no installer) still reports something sane.
let version = versions[versions.length - 1] || "";
if (!version) {
    try {
        version = JSON.parse(fs.readFileSync(path.join(DIR, "latest.json"), "utf8")).version || "";
    } catch {}
}

fs.writeFileSync(
    path.join(DIR, "available.json"),
    JSON.stringify({ version, files: grouped }, null, 2) + "\n",
    "utf8"
);

console.log(`available.json version=${version || "(unknown)"}`);
for (const key of Object.keys(grouped).sort()) {
    console.log(`  ${key}: ${grouped[key].join(", ")}`);
    for (const f of grouped[key]) {
        if (!fs.existsSync(path.join(DIR, f))) console.log(`    MISSING: ${f}`);
    }
}
console.log(`host: ${HOST}`);
