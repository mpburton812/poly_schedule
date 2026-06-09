const fs = require('fs');
const { execSync } = require('child_process');

let branch = 'dev';
let commit = 'eec3e14';

try {
  branch = execSync('git rev-parse --abbrev-ref HEAD').toString().trim();
  commit = execSync('git rev-parse --short HEAD').toString().trim();
} catch (e) {
  console.warn('Could not retrieve git info, using defaults:', e.message);
  // Try to load existing version.json to keep existing values if possible
  try {
    const existing = JSON.parse(fs.readFileSync('version.json', 'utf8'));
    branch = existing.branch || branch;
    commit = existing.commit || commit;
  } catch (err) {}
}

const versionInfo = { branch, commit };
fs.writeFileSync('version.json', JSON.stringify(versionInfo, null, 2));
console.log(`Version generated: ${branch} #${commit}`);
