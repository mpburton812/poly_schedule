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

const files = walk(path.join(__dirname, 'js'));

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let changed = false;

  const importRegex = /import\s+\{([^}]+)\}\s+from\s+['"]([^'"]*helpers\.js)['"]/g;
  content = content.replace(importRegex, (match, p1, p2) => {
    const keys = p1.split(',').map(s => s.trim()).filter(Boolean);
    const storageKeys = keys.filter(k => k.endsWith('_KEY'));
    const otherKeys = keys.filter(k => !k.endsWith('_KEY'));
    
    if (storageKeys.length === 0) return match;
    
    changed = true;
    
    const storageKeysPath = p2.replace('helpers.js', 'storage-keys.js');
    let replacement = `import { ${storageKeys.join(', ')} } from '${storageKeysPath}';`;
    
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
