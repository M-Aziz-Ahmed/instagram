// One-off generator: derive every app icon from public/Anon.png.
// Run: node tools/gen-icons.mjs
import sharp from "sharp";
import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(process.cwd());
const SRC = path.join(root, "public", "Anon.png");

// ICO containers hold PNG-encoded images (supported since Vista).
function buildIco(pngs) {
    const header = Buffer.alloc(6);
    header.writeUInt16LE(0, 0); // reserved
    header.writeUInt16LE(1, 2); // type: icon
    header.writeUInt16LE(pngs.length, 4);

    const entries = [];
    let offset = 6 + pngs.length * 16;
    for (const { size, data } of pngs) {
        const e = Buffer.alloc(16);
        e.writeUInt8(size >= 256 ? 0 : size, 0); // width  (0 means 256)
        e.writeUInt8(size >= 256 ? 0 : size, 1); // height
        e.writeUInt8(0, 2);                       // palette
        e.writeUInt8(0, 3);                       // reserved
        e.writeUInt16LE(1, 4);                    // color planes
        e.writeUInt16LE(32, 6);                   // bits per pixel
        e.writeUInt32LE(data.length, 8);
        e.writeUInt32LE(offset, 12);
        entries.push(e);
        offset += data.length;
    }
    return Buffer.concat([header, ...entries, ...pngs.map((p) => p.data)]);
}

// The source is a 2000x2000 plate whose artwork occupies only the middle ~40%,
// with wide white margins. Resizing the plate directly would produce icons
// that are almost entirely whitespace, so trim to the artwork's bounding box
// first, then re-centre it on a clean square at the requested size.
// `fill` is the fraction of the canvas the artwork may occupy: maskable PWA
// icons need a generous safe zone, favicons can run nearly edge to edge.
async function render(size, fill = 0.88, background = "#ffffff") {
    const inner = Math.max(1, Math.round(size * fill));
    const trimmed = await sharp(SRC)
        .trim({ threshold: 12 })
        .toBuffer();
    const art = await sharp(trimmed)
        .resize(inner, inner, {
            fit: "inside",
            withoutEnlargement: false,
            background,
        })
        .png()
        .toBuffer();
    const artMeta = await sharp(art).metadata();
    return sharp({
        create: {
            width: size,
            height: size,
            channels: 4,
            background,
        },
    })
        .composite([
            {
                input: art,
                left: Math.round((size - artMeta.width) / 2),
                top: Math.round((size - artMeta.height) / 2),
            },
        ])
        .png({ compressionLevel: 9 })
        .toBuffer();
}

const png = (size, fill) => render(size, fill);

// Web/PWA icons. Maskable icons (manifest "any maskable") get a safe zone.
const webTargets = [
    ["public/icon-192.png", 192, 0.8],
    ["public/icon-512.png", 512, 0.8],
    ["public/icon-1024.png", 1024, 0.8],
    ["public/apple-touch-icon.png", 180, 0.86],
    ["public/favicon-32.png", 32, 0.98],
];
// Next.js file conventions (app/) take precedence for /icon and /apple-icon
const appTargets = [
    ["app/icon.png", 256, 0.88],
    ["app/apple-icon.png", 180, 0.86],
];

for (const [rel, size, fill] of [...webTargets, ...appTargets]) {
    const buf = await png(size, fill);
    await fs.writeFile(path.join(root, rel), buf);
    console.log("wrote", rel, `${size}x${size}`, buf.length, "bytes");
}

// Favicons
const icoSizes = [16, 32, 48];
const ico = buildIco(
    await Promise.all(icoSizes.map(async (size) => ({ size, data: await png(size, 1) })))
);
for (const rel of ["public/favicon.ico", "app/favicon.ico"]) {
    await fs.writeFile(path.join(root, rel), ico);
    console.log("wrote", rel, icoSizes.join("/"), ico.length, "bytes");
}

// Tauri bundle + tray icons
const tauriTargets = [
    ["desktop/src-tauri/icons/32x32.png", 32, 1],
    ["desktop/src-tauri/icons/128x128.png", 128, 0.98],
    ["desktop/src-tauri/icons/128x128@2x.png", 256, 0.98],
    ["desktop/src-tauri/icons/icon.png", 512, 0.94],
    ["desktop/public/logo.png", 256, 0.9],
];
for (const [rel, size, fill] of tauriTargets) {
    const buf = await png(size, fill);
    await fs.writeFile(path.join(root, rel), buf);
    console.log("wrote", rel, `${size}x${size}`, buf.length, "bytes");
}
await fs.writeFile(path.join(root, "desktop/src-tauri/icons/icon.ico"), ico);
console.log("wrote desktop/src-tauri/icons/icon.ico");
console.log("done");
