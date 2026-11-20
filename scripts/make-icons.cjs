'use strict';
/**
 * Renders the five WatchTower logos (scripts/logos-data.cjs) to every icon the app needs:
 *   desktop/assets/logos/<id>.png / <id>-tray.png / <id>.ico   (window, tray, shortcuts, launcher exe)
 *   build/icon.png, desktop/assets/{icon,tray}.png, src/app/icon.png   (default = classic)
 *   src/lib/logos.json                                          (SVG marks for the UI)
 *   node scripts/make-icons.cjs
 */
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const logos = require('./logos-data.cjs');

const root = path.resolve(__dirname, '..');

async function png(svg, size) {
  return sharp(Buffer.from(svg)).resize(size, size).png().toBuffer();
}

/** Builds a multi-size .ico whose images are PNG-compressed (supported since Windows Vista). */
async function ico(svg, sizes = [16, 24, 32, 48, 64, 128, 256]) {
  const images = [];
  for (const s of sizes) images.push({ size: s, data: await png(svg, s) });
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  const entries = Buffer.alloc(16 * images.length);
  let offset = 6 + entries.length;
  images.forEach((img, i) => {
    const e = i * 16;
    entries.writeUInt8(img.size >= 256 ? 0 : img.size, e);
    entries.writeUInt8(img.size >= 256 ? 0 : img.size, e + 1);
    entries.writeUInt8(0, e + 2);
    entries.writeUInt8(0, e + 3);
    entries.writeUInt16LE(1, e + 4);
    entries.writeUInt16LE(32, e + 6);
    entries.writeUInt32LE(img.data.length, e + 8);
    entries.writeUInt32LE(offset, e + 12);
    offset += img.data.length;
  });
  return Buffer.concat([header, entries, ...images.map((i) => i.data)]);
}

(async () => {
  const dir = path.join(root, 'desktop', 'assets', 'logos');
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.join(root, 'build'), { recursive: true });
  for (const l of logos) {
    fs.writeFileSync(path.join(dir, `${l.id}.png`), await png(l.svg, 256));
    fs.writeFileSync(path.join(dir, `${l.id}-tray.png`), await png(l.svg, 32));
    fs.writeFileSync(path.join(dir, `${l.id}.ico`), await ico(l.svg));
    fs.writeFileSync(path.join(dir, `${l.id}.svg`), l.svg);
    console.log(`logo ${l.id}`);
  }
  const classic = logos[0];
  fs.writeFileSync(path.join(root, 'build', 'icon.png'), await png(classic.svg, 512));
  fs.writeFileSync(path.join(root, 'desktop', 'assets', 'icon.png'), await png(classic.svg, 256));
  fs.writeFileSync(path.join(root, 'desktop', 'assets', 'tray.png'), await png(classic.svg, 32));
  fs.writeFileSync(path.join(root, 'src', 'app', 'icon.png'), await png(classic.svg, 64));
  fs.writeFileSync(path.join(root, 'src', 'lib', 'logos.json'), JSON.stringify(logos.map(({ id, label, desc, svg }) => ({ id, label, desc, svg })), null, 2) + '\n');
  console.log('icons written');
})().catch((e) => { console.error(e); process.exit(1); });
