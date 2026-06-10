/**
 * Prepare static files for Vercel (outputDirectory: public).
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.join(__dirname, '..');
const out = path.join(root, 'public');

execSync('node generate-version.js', { cwd: root, stdio: 'inherit' });

if (fs.existsSync(out)) {
  fs.rmSync(out, { recursive: true, force: true });
}
fs.mkdirSync(out, { recursive: true });

const copyPaths = [
  'index.html',
  'manifest.json',
  'sw.js',
  'version.json',
  'release-notes.json',
  'css',
  'js',
  'icons',
  'assets'
];

for (const item of copyPaths) {
  const src = path.join(root, item);
  const dest = path.join(out, item);
  if (!fs.existsSync(src)) continue;
  if (fs.statSync(src).isDirectory()) {
    fs.cpSync(src, dest, { recursive: true });
  } else {
    fs.cpSync(src, dest);
  }
}

console.log('Vercel static output written to public/');
