#!/usr/bin/env node
// Writes <dist>/THIRD_PARTY_LICENSES.txt with the license text of each named package.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const [dist, ...pkgs] = process.argv.slice(2);
const req = createRequire(path.join(process.cwd(), 'package.json'));
const parts = pkgs.map((name) => {
  const dir = path.dirname(req.resolve(`${name}/package.json`));
  const pkg = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'));
  const file = readdirSync(dir).find((f) => /^licen[cs]e/i.test(f));
  return `${pkg.name}@${pkg.version} (${pkg.license})\n${'-'.repeat(60)}\n${file ? readFileSync(path.join(dir, file), 'utf8').trim() : 'See the package repository.'}\n`;
});
writeFileSync(path.join(dist, 'THIRD_PARTY_LICENSES.txt'), `Third-party code in this build. Game code and assets: MIT, GameDNA contributors.\n\n${parts.join('\n')}`);
console.log(`copy-licenses: ${pkgs.join(', ')} -> ${dist}/THIRD_PARTY_LICENSES.txt`);
