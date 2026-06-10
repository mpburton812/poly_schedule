const fs = require('fs');
const path = require('path');

const srcPath = path.join(__dirname, '..', 'js', 'views.js');
const src = fs.readFileSync(srcPath, 'utf8');
const header = src.split('export const Views = {')[0];
const body = src.split('export const Views = {')[1].replace(/\n};\s*$/, '');

const methods = [
  ['schedule', 'scheduleView'],
  ['proposals', 'proposalsView'],
  ['createProposal', 'createProposalView'],
  ['logistics', 'logisticsView'],
  ['settings', 'settingsView'],
  ['admin', 'adminView'],
  ['addPartner', 'addPartnerView'],
  ['addHome', 'addHomeView'],
  ['login', 'loginView'],
  ['editPartner', 'editPartnerView'],
  ['editHome', 'editHomeView'],
  ['activatePartner', 'activatePartnerView']
];

const viewsDir = path.join(__dirname, '..', 'js', 'views');
fs.mkdirSync(viewsDir, { recursive: true });

const imports = header.trim();

for (let i = 0; i < methods.length; i++) {
  const [name, exportName] = methods[i];
  const start = body.indexOf(`${name}(state`);
  const nextStarts = methods.slice(i + 1)
    .map(m => body.indexOf(`${m[0]}(state`))
    .filter(x => x >= 0);
  const end = nextStarts.length ? Math.min(...nextStarts) : body.length;
  let fnBody = body.slice(start, end).trim().replace(/,\s*$/, '');
  const file = `${imports}\n\nexport function ${exportName}${fnBody.slice(name.length)}`;
  fs.writeFileSync(path.join(viewsDir, `${name}.js`), file);
}

const indexImports = methods
  .map(([name, exportName]) => `import { ${exportName} } from './${name}.js';`)
  .join('\n');

const indexBody = `${imports}\n\n${indexImports}\n\nexport { DEFAULT_AVATARS };\n\nexport const Views = {\n${methods.map(([name, exportName]) => `  ${name}: ${exportName}`).join(',\n')}\n};\n`;

fs.writeFileSync(path.join(viewsDir, 'index.js'), indexBody);
fs.writeFileSync(srcPath, "export { Views, DEFAULT_AVATARS } from './views/index.js';\n");

console.log(`Split views into ${methods.length} files`);
