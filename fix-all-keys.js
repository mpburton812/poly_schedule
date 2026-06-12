const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) { 
      results = results.concat(walk(file));
    } else if (file.endsWith('.js')) {
      results.push(file);
    }
  });
  return results;
}

const jsDir = path.join(__dirname, 'js');
const files = walk(jsDir);
const storageKeysFile = path.join(jsDir, 'storage-keys.js');

files.forEach(file => {
  if (file === storageKeysFile) return;

  let content = fs.readFileSync(file, 'utf8');
  let changed = false;

  const importRegex = /import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"];?/g;
  content = content.replace(importRegex, (match, p1, p2) => {
    if (p2.includes('storage-keys.js')) return match;

    const keys = p1.split(',').map(s => s.trim()).filter(Boolean);
    const storageKeys = keys.filter(k => k.endsWith('_KEY'));
    const otherKeys = keys.filter(k => !k.endsWith('_KEY'));
    
    if (storageKeys.length === 0) return match;
    
    changed = true;
    
    // figure out relative path to storage-keys.js
    let relPath = path.relative(path.dirname(file), storageKeysFile).replace(/\\/g, '/');
    if (!relPath.startsWith('.')) relPath = './' + relPath;

    let replacement = `import { ${storageKeys.join(', ')} } from '${relPath}';`;
    
    if (otherKeys.length > 0) {
      replacement += `\nimport { ${otherKeys.join(', ')} } from '${p2}';`;
    }
    
    return replacement;
  });

  if (changed) {
    fs.writeFileSync(file, content);
    console.log('Fixed', file);
  }
});
