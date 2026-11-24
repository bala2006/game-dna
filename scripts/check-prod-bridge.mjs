#!/usr/bin/env node
// Fails if a production build contains the development-only GameDNA bridge (GD-043).
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';

const MARKERS = ['__GAMEDNA__', 'gamedna-adapter', 'setExperimentParameters', 'beginScenario'];
const dirs = process.argv.slice(2);
if (dirs.length === 0) {
  console.error('usage: check-prod-bridge.mjs <dist-dir> [...]');
  process.exit(2);
}
let failed = false;
for (const dir of dirs) {
  if (!existsSync(dir)) {
    console.error(`check-prod-bridge: ${dir} does not exist (build first)`);
    failed = true;
    continue;
  }
  const stack = [dir];
  let files = 0;
  while (stack.length) {
    const cur = stack.pop();
    for (const name of readdirSync(cur)) {
      const p = path.join(cur, name);
      if (statSync(p).isDirectory()) stack.push(p);
      else if (/\.(js|mjs|html|json|map)$/.test(name)) {
        files++;
        const text = readFileSync(p, 'utf8');
        for (const m of MARKERS) {
          if (text.includes(m)) {
            console.error(`check-prod-bridge: FAILED ${p} contains "${m}"`);
            failed = true;
          }
        }
      }
    }
  }
  if (!failed) console.log(`check-prod-bridge: passed (${files} files in ${dir}, no dev bridge markers)`);
}
process.exit(failed ? 1 : 0);
