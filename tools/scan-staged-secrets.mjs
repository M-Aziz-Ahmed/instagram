// Scan the staged desktop payload for values taken from the repo .env.
// Usage: node tools/scan-staged-secrets.mjs
import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const staged = path.join(root, "desktop", "src-tauri", "resources", "app");

// Text files only; the bundle is mostly JS and JSON.
const TEXT_EXT = new Set([
    ".js", ".mjs", ".cjs", ".json", ".html", ".css", ".txt", ".map", ".env", ".pem", ".xml", ".yml", ".yaml",
]);

async function* walk(dir) {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) yield* walk(full);
        else if (entry.isFile()) yield full;
    }
}

const envRaw = await fs.readFile(path.join(root, ".env"), "utf8");
const secrets = [];
for (const line of envRaw.split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/.exec(line);
    if (!m) continue;
    const [, name, rawValue] = m;
    let value = rawValue.trim().replace(/^["']|["']$/g, "");
    if (value.length < 12) continue;
    if (name.startsWith("NEXT_PUBLIC_")) continue;
    secrets.push({ name, value });
}

console.log(`scanning for ${secrets.length} non-public .env values (len >= 12)\n`);

const allowStaged = new Set(["JWT_SECRET", "TMDB_API_KEY"]);
let hits = 0;
let leaks = 0;
const files = [];
for await (const file of walk(staged)) files.push(file);
for (const file of files) {
    // path.extname(".env") is "", so dotfiles need their own check.
    const isDotenv = path.basename(file).startsWith(".env");
    if (!isDotenv && !TEXT_EXT.has(path.extname(file).toLowerCase())) continue;
    let text;
    try {
        text = await fs.readFile(file, "utf8");
    } catch {
        continue;
    }
    for (const { name, value } of secrets) {
        if (text.includes(value)) {
            hits++;
            const where = allowStaged.has(name) && path.basename(file) === ".env" ? "EXPECTED" : "LEAK";
            if (where === "LEAK") leaks++;
            console.log(`${where}  ${name}  ->  ${path.relative(root, file)}`);
        }
    }
}
console.log(`\n${hits} match(es); anything marked LEAK must not ship.`);
if (leaks > 0) {
    console.error(`\n${leaks} secret(s) would ship in the installer. Refusing to continue.`);
    process.exit(1);
}
