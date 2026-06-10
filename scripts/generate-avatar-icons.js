/**
 * Resizes source bird icons to 128px PNGs for avatar picker use.
 * Run: node scripts/generate-avatar-icons.js
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const SOURCE_DIR = path.join(__dirname, '..', 'assets', 'images', 'icons');
const OUT_DIR = path.join(SOURCE_DIR, '128');
const SIZE = 128;

const BIRDS = [
  'bird_blue.png',
  'bird_green.png',
  'bird_orange.png',
  'bird_purple.png',
  'bird_red.png',
  'bird_yellow.png'
];

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  for (const name of BIRDS) {
    const input = path.join(SOURCE_DIR, name);
    const output = path.join(OUT_DIR, name);
    if (!fs.existsSync(input)) {
      console.warn(`Skip missing: ${name}`);
      continue;
    }
    await sharp(input)
      .resize(SIZE, SIZE, { fit: 'cover', position: 'centre' })
      .png({ compressionLevel: 9, palette: true })
      .toFile(output);
    const stat = fs.statSync(output);
    console.log(`Wrote ${path.relative(process.cwd(), output)} (${Math.round(stat.size / 1024)} KB)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
