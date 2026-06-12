const fs = require('fs');
const path = require('path');

const files = [
  'js/app/household-config.js',
  'js/app/impersonation.js',
  'js/app/notification-store.js',
  'js/app/operation-log.js',
  'js/app/session.js'
];

files.forEach(f => {
  const filepath = path.join(__dirname, f);
  if (fs.existsSync(filepath)) {
    let content = fs.readFileSync(filepath, 'utf8');
    content = content.replace(/\\`/g, '`').replace(/\\\$/g, '$').replace(/\\\\n/g, '\\n');
    fs.writeFileSync(filepath, content);
    console.log('Fixed', f);
  }
});
