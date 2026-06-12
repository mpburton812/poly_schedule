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
const allKeys = new Set();
const fileKeys = new Map();

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  const matches = content.match(/\b[A-Z0-9_]+_KEY\b/g);
  if (matches) {
    matches.forEach(m => {
      allKeys.add(m);
      if (!fileKeys.has(m)) fileKeys.set(m, new Set());
      fileKeys.get(m).add(path.relative(__dirname, file));
    });
  }
});

const storageKeysContent = fs.readFileSync(path.join(__dirname, 'js', 'storage-keys.js'), 'utf8');
const definedKeys = new Set(storageKeysContent.match(/\bexport const ([A-Z0-9_]+_KEY)\b/g)?.map(s => s.replace('export const ', '')) || []);

const missing = [];
files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  const matches = [...new Set(content.match(/\b[A-Z0-9_]+_KEY\b/g) || [])];
  matches.forEach(key => {
    // Check if the key is imported in this file
    const isImported = new RegExp(`import\\s+\\{[^}]*\\b${key}\\b[^}]*\\}\\s+from`).test(content);
    // Check if the key is defined in this file
    const isDefined = new RegExp(`const\\s+${key}\\b`).test(content) || new RegExp(`let\\s+${key}\\b`).test(content);
    
    if (!isImported && !isDefined && key !== 'PROMOTION_KEY_STORAGE') {
      missing.push(`${key} in ${path.relative(__dirname, file)}`);
    }
  });
});

if (missing.length > 0) {
  console.log('Missing imports or definitions:');
  missing.forEach(m => console.log(m));
} else {
  console.log('All keys imported correctly.');
}
