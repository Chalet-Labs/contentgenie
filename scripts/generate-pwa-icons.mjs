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

// Maskable icon: Android launchers crop the outer ~10% per edge into arbitrary
// shapes. We render the glyph inset to ~22% (112/512) so it stays well inside
// the safe zone across circle/squircle/rounded-square masks. Fill color must
// match --brand / --brand-foreground in globals.css (light mode).
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

// density: 384 rasterizes the 32-viewBox source SVG cleanly at 512px
// (384 dpi × 32/72 ≈ 170px native, upscaled to 512 with antialiasing).
// Don't lower to the default 72 — small glyph details become blurry.
function rasterize(svgBuffer, size) {
  return sharp(svgBuffer, { density: 384 })
    .resize(size, size, { fit: "contain" })
    .png();
}

const writes = [];

async function stagePng(svgBuffer, size, outPath) {
  const tmp = `${outPath}.tmp`;
  await rasterize(svgBuffer, size).toFile(tmp);
  writes.push({ tmp, final: outPath, label: `${path.relative(root, outPath)} (${size}×${size})` });
}

async function stageIco(svgBuffer, sizes, outPath) {
  // Minimal multi-size ICO: each entry is a PNG payload inside the ICO
  // container — the spec allows this and modern browsers render it fine.
  if (!sizes.every((s) => Number.isInteger(s) && s > 0 && s <= 256)) {
    throw new RangeError(`ICO sizes must be integers in (0, 256], got ${JSON.stringify(sizes)}`);
  }

  const pngs = await Promise.all(
    sizes.map((size) => rasterize(svgBuffer, size).toBuffer()),
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
    // ICO spec quirk: width/height byte of 0 encodes 256.
    entry.writeUInt8(size === 256 ? 0 : size, 0);
    entry.writeUInt8(size === 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2); // palette
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(pngs[i].length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += pngs[i].length;
    dirEntries.push(entry);
  }

  const tmp = `${outPath}.tmp`;
  await fs.writeFile(tmp, Buffer.concat([header, ...dirEntries, ...pngs]));
  writes.push({ tmp, final: outPath, label: `${path.relative(root, outPath)} (${sizes.join(", ")})` });
}

async function commitAll() {
  // Two-phase write: rasterize everything to .tmp files first, then rename
  // in a single pass. A mid-run failure leaves the on-disk icons untouched
  // rather than shipping a half-rebranded set.
  for (const { tmp, final, label } of writes) {
    await fs.rename(tmp, final);
    console.log(`  → ${label}`);
  }
}

async function cleanupTmp() {
  for (const { tmp } of writes) {
    await fs.rm(tmp, { force: true });
  }
}

try {
  console.log("Regenerating PWA icons from public/brand/logo-mark.svg …");
  await stagePng(logoSvg, 192, path.join(outDir, "icon-192x192.png"));
  await stagePng(logoSvg, 512, path.join(outDir, "icon-512x512.png"));
  await stagePng(maskableSvg, 512, path.join(outDir, "icon-maskable-512x512.png"));
  await stagePng(logoSvg, 180, path.join(outDir, "apple-touch-icon.png"));
  await stageIco(logoSvg, [16, 32, 48], path.join(outDir, "favicon.ico"));
  await commitAll();
  console.log("Done.");
} catch (err) {
  await cleanupTmp();
  console.error("Icon generation failed:", err);
  process.exit(1);
}
