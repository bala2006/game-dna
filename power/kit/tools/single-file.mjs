#!/usr/bin/env node
// Packs a Vite build into one HTML file: every module script and stylesheet in <dist>/index.html
// is inlined. Usage: node single-file.mjs <dist> [out.html]
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const [distArg, outArg] = process.argv.slice(2);
if (!distArg) {
  console.error('usage: node single-file.mjs <dist> [out.html]');
  process.exit(1);
}
const dist = path.resolve(distArg), index = path.join(dist, 'index.html');
if (!existsSync(index)) {
  console.error(`single-file: ${index} not found; run vite build first`);
  process.exit(1);
}
const read = (src) => {
  const file = path.resolve(dist, src.replace(/^\.?\//, ''));
  if (!file.startsWith(dist)) throw new Error(`single-file: ${src} is outside ${dist}`);
  return readFileSync(file, 'utf8');
};
const html = readFileSync(index, 'utf8')
  .replace(/<script type="module" crossorigin src="([^"]+)"><\/script>/g, (_, src) => `<script type="module">${read(src).replace(/<\/script/gi, '<\\/script')}</script>`)
  .replace(/<link rel="stylesheet" crossorigin href="([^"]+)">/g, (_, href) => `<style>${read(href)}</style>`)
  .replace(/<link rel="modulepreload"[^>]*>/g, '');
const out = path.resolve(outArg ?? path.join(dist, 'single.html'));
writeFileSync(out, html);
console.error(`single-file: wrote ${path.relative(process.cwd(), out)} (${(html.length / 1024).toFixed(0)} KB)`);
