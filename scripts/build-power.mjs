#!/usr/bin/env node
// Refreshes power/kit, the copy of the GameDNA Kit source that ships inside the Power for games
// outside this repository. packages/kit stays the only place the Kit is edited; CI fails when the
// committed copy differs (npm run check:power).
import { cpSync, existsSync, rmSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const kitSrc = path.join(root, 'packages', 'kit');
const kitOut = path.join(root, 'power', 'kit');

if (!existsSync(path.join(kitSrc, 'src'))) {
  console.error('build-power: packages/kit/src is missing');
  process.exit(1);
}
rmSync(kitOut, { recursive: true, force: true });
for (const entry of ['src', 'tools', 'README.md']) {
  const from = path.join(kitSrc, entry);
  if (existsSync(from)) cpSync(from, path.join(kitOut, entry), { recursive: true });
}
console.log(`build-power: copied packages/kit to ${path.relative(root, kitOut)}`);
