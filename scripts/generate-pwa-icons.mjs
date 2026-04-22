#!/usr/bin/env node
// Regenerate PWA bitmap icons from public/brand/logo-mark.svg.
// Outputs:
//   public/icon-192x192.png
//   public/icon-512x512.png
//   public/icon-maskable-512x512.png  (padded safe-zone)
//   public/apple-touch-icon.png       (180×180)
//   public/favicon.ico                (16/32/48 sizes)

import fs from "node:fs/promises";
import path from "node:path";
import url from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(root, "public/brand/logo-mark.svg");
const outDir = path.join(root, "public");

const logoSvg = await fs.readFile(sourcePath);

// The source mark already includes its amber tile at viewBox 0 0 32 32.
// For `maskable`, we render the glyph on a larger amber canvas so the safe
// zone (inner 80%) is respected by Android launchers.
const maskableSvg = Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="none">
  <rect width="512" height="512" fill="#F59E0B"/>
  <g transform="translate(112 112) scale(9)">
    <path d="M7 8 h18 a3 3 0 0 1 3 3 v8 a3 3 0 0 1 -3 3 h-10 l-5 4 v-4 h-3 a3 3 0 0 1 -3 -3 v-8 a3 3 0 0 1 3 -3 z" fill="#1A1407"/>
    <rect x="11.5" y="14" width="2" height="3" rx="1" fill="#F59E0B"/>
    <rect x="15.5" y="11.5" width="2" height="8" rx="1" fill="#F59E0B"/>
    <rect x="19.5" y="13" width="2" height="5" rx="1" fill="#F59E0B"/>
  </g>
</svg>
`);

async function writePng(svgBuffer, size, outPath) {
  await sharp(svgBuffer, { density: 384 })
    .resize(size, size, { fit: "contain" })
    .png()
    .toFile(outPath);
  console.log(`  → ${path.relative(root, outPath)} (${size}×${size})`);
}

async function writeIco(svgBuffer, sizes, outPath) {
  // Minimal multi-size ICO (BMP-encoded). Each image is embedded as its
  // own PNG within the ICO container — modern browsers handle this fine.
  const pngs = await Promise.all(
    sizes.map((size) =>
      sharp(svgBuffer, { density: 384 })
        .resize(size, size, { fit: "contain" })
        .png()
        .toBuffer(),
    ),
  );

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(sizes.length, 4);

  const dirEntries = [];
  let offset = 6 + sizes.length * 16;
  for (let i = 0; i < sizes.length; i++) {
    const entry = Buffer.alloc(16);
    const size = sizes[i];
    entry.writeUInt8(size >= 256 ? 0 : size, 0); // width
    entry.writeUInt8(size >= 256 ? 0 : size, 1); // height
    entry.writeUInt8(0, 2); // palette
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(pngs[i].length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += pngs[i].length;
    dirEntries.push(entry);
  }

  await fs.writeFile(outPath, Buffer.concat([header, ...dirEntries, ...pngs]));
  console.log(`  → ${path.relative(root, outPath)} (${sizes.join(", ")})`);
}

console.log("Regenerating PWA icons from public/brand/logo-mark.svg …");
await writePng(logoSvg, 192, path.join(outDir, "icon-192x192.png"));
await writePng(logoSvg, 512, path.join(outDir, "icon-512x512.png"));
await writePng(maskableSvg, 512, path.join(outDir, "icon-maskable-512x512.png"));
await writePng(logoSvg, 180, path.join(outDir, "apple-touch-icon.png"));
await writeIco(logoSvg, [16, 32, 48], path.join(outDir, "favicon.ico"));
console.log("Done.");
