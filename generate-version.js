const fs = require('fs');
const { execSync } = require('child_process');

function shortSha(value) {
  if (!value) return null;
  return String(value).trim().slice(0, 7);
}

let branch = null;
let commit = null;

try {
  branch = execSync('git rev-parse --abbrev-ref HEAD').toString().trim();
  commit = execSync('git rev-parse --short HEAD').toString().trim();
} catch (e) {
  console.warn('Could not retrieve git info:', e.message);
}

if (!branch) {
  branch = process.env.VERCEL_GIT_COMMIT_REF || 'dev';
}
if (!commit) {
  commit = shortSha(process.env.VERCEL_GIT_COMMIT_SHA) || 'local';
}

try {
  const existing = JSON.parse(fs.readFileSync('version.json', 'utf8'));
  if (branch === 'dev' && commit === 'local') {
    branch = existing.branch || branch;
    commit = existing.commit || commit;
  }
} catch (err) {}

const versionInfo = {
  branch,
  commit,
  notifyUrl: (process.env.PUBLIC_NOTIFY_URL || '').trim().replace(/\/$/, '') || undefined
};
if (!versionInfo.notifyUrl) delete versionInfo.notifyUrl;
fs.writeFileSync('version.json', JSON.stringify(versionInfo, null, 2));
console.log(`Version generated: ${branch} #${commit}`);
