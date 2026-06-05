import fs from 'fs';
import path from 'path';

function walk(dir) {
  const res = [];
  const items = fs.readdirSync(dir);
  const skipDirs = new Set(['node_modules', 'dist', 'backup', 'data', 'files', 'logs', 'temp', 'tmp', 'release', 'scripts']);
  for (const item of items) {
    const full = path.join(dir, item);
    if (fs.statSync(full).isDirectory()) {
      if (!skipDirs.has(item)) {
        res.push(...walk(full));
      }
    } else if (item.endsWith('.ts') || item.endsWith('.js') || item.endsWith('.mjs')) {
      const content = fs.readFileSync(full, 'utf8');
      const lines = content.split('\n').length;
      res.push({ path: full, lines });
    }
  }
  return res;
}

const files = walk('.').filter(f => f.lines > 0).sort((a, b) => b.lines - a.lines);
console.log('行数  パス');
console.log('---  ---');
for (const f of files) {
  const marker = f.lines > 300 ? ' ⚠️' : '';
  console.log(String(f.lines).padStart(5) + '  ' + f.path + marker);
}

const over300 = files.filter(f => f.lines > 300);
console.log('\n合計: ' + files.length + 'ファイル, 300行超: ' + over300.length + 'ファイル');
