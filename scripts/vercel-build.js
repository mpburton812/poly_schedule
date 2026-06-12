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

const version = JSON.parse(fs.readFileSync(path.join(root, 'version.json'), 'utf8'));
const indexPath = path.join(out, 'index.html');
if (fs.existsSync(indexPath)) {
  let html = fs.readFileSync(indexPath, 'utf8');
  html = html.replace(
    /BUILD #[^•]+ • BRANCH [^<]+/,
    `BUILD #${version.commit} • BRANCH ${version.branch}`
  );
  fs.writeFileSync(indexPath, html);
}

console.log('Vercel static output written to public/');
