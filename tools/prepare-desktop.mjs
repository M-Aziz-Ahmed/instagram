// Prepare the payload the Tauri installer ships: a self-contained Next.js server
// plus a Node runtime to run it on.
//
// Run: node tools/prepare-desktop.mjs
//
// Why a server and not a static export: this app leans on rewrites (next.config.mjs
// proxies /api and /sio to the live server), on middleware (proxy.js), and on a large
// number of dynamic routes. All three are unsupported by `output: "export"`, so the
// desktop app carries the real Next server and starts it as a sidecar on 127.0.0.1.
//
// The API and socket.io traffic still proxy onward to the shared live server exactly
// as they do on the web, so this only changes where the UI is served from.
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

// Keep in lockstep with NODE_VERSION below; Next 16 needs Node 20.9+.
const NODE_VERSION = "24.16.0";

const root = path.resolve(import.meta.dirname, "..");
const standalone = path.join(root, ".next", "standalone");
const staticDir = path.join(root, ".next", "static");
const publicDir = path.join(root, "public");
const resources = path.join(root, "desktop", "src-tauri", "resources");
const stagedApp = path.join(resources, "app");

// The desktop shell talks to this. Fixed rather than random so the window URL can
// stay a static string in tauri.conf.json.
const SIDECAR_PORT = 3210;

function run(cmd, args, opts = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(cmd, args, { stdio: "inherit", ...opts });
        child.on("error", reject);
        child.on("exit", (code) =>
            code === 0 ? resolve() : reject(new Error(`${cmd} exited with ${code}`))
        );
    });
}

async function exists(p) {
    try {
        await fs.access(p);
        return true;
    } catch {
        return false;
    }
}

async function dirSizeBytes(dir) {
    let total = 0;
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) total += await dirSizeBytes(full);
        else if (entry.isFile()) total += (await fs.stat(full)).size;
    }
    return total;
}

// `next build` with no flag skips output:"standalone", so it is set in the child env.
async function build() {
    const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
    await run(process.execPath, [nextBin, "build"], {
        cwd: root,
        env: { ...process.env, DESKTOP_BUILD: "1", NODE_ENV: "production" },
    });
}

// The standalone server deliberately does not copy these two directories; without
// them every page renders unstyled and every asset 404s.
async function collectAssets() {
    await fs.cp(publicDir, path.join(standalone, "public"), { recursive: true });
    await fs.mkdir(path.join(standalone, ".next"), { recursive: true });
    await fs.cp(staticDir, path.join(standalone, ".next", "static"), { recursive: true });
}

async function stage() {
    await fs.rm(resources, { recursive: true, force: true });
    await fs.mkdir(resources, { recursive: true });
    await fs.cp(standalone, stagedApp, { recursive: true });
}

function platformTarget() {
    const arch = process.arch === "arm64" ? "arm64" : "x64";
    if (process.platform === "win32") return { triple: `win-${arch}`, archiveExt: "zip" };
    if (process.platform === "darwin") return { triple: `darwin-${arch}`, archiveExt: "tar.gz" };
    return { triple: `linux-${arch}`, archiveExt: "tar.gz" };
}

// node.exe alone is ~80MB, which is too heavy to keep in git, so the runtime is
// fetched once per machine and cached outside the repo tree's tracked files.
//
// The staged name is always "node.exe" so a single tauri.conf.json resource entry
// resolves on all three build targets. Windows needs the extension to resolve the
// binary by name; Linux and macOS ignore the suffix when executing, so the same
// file works there once it carries the exec bit.
async function fetchNodeRuntime() {
    const { triple, archiveExt } = platformTarget();
    const binName = "node.exe";
    const binDir = path.join(resources, "bin");
    const binPath = path.join(binDir, binName);

    if (await exists(binPath)) {
        console.log(`node runtime already staged: ${binPath}`);
        return binPath;
    }

    const isWindows = process.platform === "win32";
    const archive = `node-v${NODE_VERSION}-${triple}.${archiveExt}`;
    const url = `https://nodejs.org/dist/v${NODE_VERSION}/${archive}`;

    await fs.mkdir(binDir, { recursive: true });
    const tmp = path.join(os.tmpdir(), archive);
    console.log(`downloading ${url}`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`node download failed: ${res.status} ${res.statusText}`);
    await fs.writeFile(tmp, Buffer.from(await res.arrayBuffer()));

    const extractDir = path.join(os.tmpdir(), `node-extract-${triple}`);
    await fs.rm(extractDir, { recursive: true, force: true });
    await fs.mkdir(extractDir, { recursive: true });

    if (isWindows) {
        // Expand-Archive is the only unzip available without adding a dependency.
        await run(
            "powershell",
            [
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                `Expand-Archive -LiteralPath '${tmp}' -DestinationPath '${extractDir}' -Force`,
            ],
            { stdio: "inherit" }
        );
    } else {
        await run("tar", ["-xzf", tmp, "-C", extractDir], { stdio: "inherit" });
    }

    // The archive unpacks to a versioned top-level directory. The Windows zip puts
    // the executable at that top level; the linux/macOS tarballs use bin/.
    const entries = await fs.readdir(extractDir);
    const rootDir = path.join(extractDir, entries[0]);
    const exeName = isWindows ? "node.exe" : "node";
    const candidates = [path.join(rootDir, "bin", exeName), path.join(rootDir, exeName)];
    let source = null;
    for (const candidate of candidates) {
        if (await exists(candidate)) {
            source = candidate;
            break;
        }
    }
    if (!source) {
        throw new Error(
            `no node executable inside ${archive}\n` +
                `  extracted into: ${extractDir}\n` +
                `  top level: ${JSON.stringify(entries)}\n` +
                `  tried: ${candidates.join("\n         ")}`
        );
    }
    await fs.copyFile(source, binPath);
    if (!isWindows) await fs.chmod(binPath, 0o755);

    await fs.rm(tmp, { force: true });
    await fs.rm(extractDir, { recursive: true, force: true });
    console.log(`staged node runtime: ${binPath}`);
    return binPath;
}

// Next's output tracing copies the repo .env into the standalone bundle. That file
// carries the live server's Mongo credentials, Cloudinary API secret, Brevo key and
// VAPID private key — none of which the bundled UI touches. Staging it verbatim would
// hand every installer the backend's secrets, so the copy is reduced to the values the
// local Next server actually reads at runtime.
//
// JWT_SECRET has to be here: proxy.js and utils/jwt.js verify the session cookie with
// it, and live-server signs that cookie with the same value, so without it every
// signed-in user is treated as logged out. Everything else the backend needs
// (Mongo, Cloudinary, Brevo, Gmail, VAPID private, Firebase) is deliberately dropped.
//
// NEXT_PUBLIC_* are kept because they are public by definition (Next inlines them into
// the browser bundle at build time anyway) and some are still read server-side.
const RUNTIME_ENV_ALLOWLIST = [
    "JWT_SECRET",
    "TMDB_API_KEY",
];

async function reduceStagedEnv() {
    const staged = path.join(stagedApp, ".env");

    // Drop every .env variant the tracer may have pulled in, not just `.env`.
    const entries = await fs.readdir(stagedApp, { withFileTypes: true });
    for (const entry of entries) {
        if (entry.isFile() && entry.name.startsWith(".env")) {
            await fs.rm(path.join(stagedApp, entry.name), { force: true });
        }
    }

    const source = path.join(root, ".env");
    let raw = "";
    try {
        raw = await fs.readFile(source, "utf8");
    } catch {
        console.warn("no root .env found; the bundled server will fall back to its defaults");
        return;
    }

    const kept = [];
    for (const line of raw.split(/\r?\n/)) {
        const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);
        if (!match) continue;
        const name = match[1];
        if (name.startsWith("NEXT_PUBLIC_") || RUNTIME_ENV_ALLOWLIST.includes(name)) {
            kept.push(line);
        }
    }

    const header =
        "# Generated by tools/prepare-desktop.mjs - do not edit.\n" +
        "# Reduced to the values the bundled Next server reads at runtime; the live\n" +
        "# server's own credentials are intentionally excluded.\n";
    await fs.writeFile(staged, header + kept.join("\n") + "\n");
    console.log(`staged .env with ${kept.length} of the repo's variables`);
}

async function main() {
    // `--skip-build` reuses the existing .next output, which makes iterating on the
    // packaging steps fast.
    const skipBuild = process.argv.includes("--skip-build");

    if (skipBuild) {
        console.log("skipping next build (--skip-build)");
    } else {
        console.log(`building standalone Next server (port ${SIDECAR_PORT} at runtime)...`);
        await build();
    }
    await collectAssets();
    await stage();
    await reduceStagedEnv();
    await fetchNodeRuntime();

    // Fail the packaging step outright if a backend secret would be shipped.
    await run(process.execPath, [path.join(root, "tools", "scan-staged-secrets.mjs")], {
        cwd: root,
    });

    const appMB = (await dirSizeBytes(stagedApp)) / 1024 / 1024;
    console.log("");
    console.log(`staged ${path.relative(root, stagedApp)} (${appMB.toFixed(1)} MB)`);
    console.log(`staged ${path.relative(root, path.join(resources, "bin"))}`);
    console.log("");
    console.log("next: cd desktop && npx tauri build");
}

await main();
