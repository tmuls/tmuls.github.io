import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

const version = createHash('md5').update(readFileSync('www/build/app.esm.js')).digest('hex').slice(0, 10);

const targets = ['www/index.html', 'www/uo/index.html', 'www/guide/index.html'];

for (const file of targets) {
  if (!existsSync(file)) continue;
  let html = readFileSync(file, 'utf8');
  html = html
    .replace(/(\/build\/app\.esm\.js)(\?v=[a-f0-9]+)?/g, `$1?v=${version}`)
    .replace(/(\/build\/app\.js)(\?v=[a-f0-9]+)?/g, `$1?v=${version}`)
    .replace(/(\/build\/app\.css)(\?v=[a-f0-9]+)?/g, `$1?v=${version}`);
  writeFileSync(file, html, 'utf8');
}

console.log(`Cache-busted build entry assets with version ${version}`);
