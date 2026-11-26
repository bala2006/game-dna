/**
 * Shared helpers for the browser tests of the GameDNA Kit apps: a static server for a built
 * `dist/`, a SwiftShader Chromium, a stub gamepad and a fail-fast page loader.
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { chromium, type Browser, type BrowserContext, type BrowserContextOptions, type Page } from 'playwright';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.wav': 'audio/wav', '.txt': 'text/plain; charset=utf-8',
};

export async function serveDist(dist: string): Promise<{ url: string; close: () => Promise<void> }> {
  if (!existsSync(path.join(dist, 'index.html'))) throw new Error(`${dist}/index.html is missing; run npm run build first`);
  const root = path.resolve(dist);
  const server = createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
    const file = path.resolve(root, `.${rel.endsWith('/') ? `${rel}index.html` : rel}`);
    if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(res);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}/`, close: () => new Promise((resolve) => server.close(() => resolve())) };
}

export const launchChromium = (): Promise<Browser> =>
  chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

/** Opens `url` with a stub gamepad (`window.__pad`) and waits for the `?dev` hook `window.__game`. Fails on the first page error. */
export async function openGame(browser: Browser, url: string, options: BrowserContextOptions = {}): Promise<{ ctx: BrowserContext; page: Page; errors: string[] }> {
  const ctx = await browser.newContext(options);
  await ctx.addInitScript(() => {
    const pad = { axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ value: 0, pressed: false })), connected: false };
    (window as unknown as { __pad: typeof pad }).__pad = pad;
    navigator.getGamepads = () => [pad.connected ? (pad as unknown as Gamepad) : null];
  });
  const page = await ctx.newPage(), errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const failed = new Promise<never>((_, reject) => page.on('pageerror', (e) => reject(e)));
  await page.goto(url);
  await Promise.race([page.waitForFunction(() => 'window' in globalThis && '__game' in window, null, { timeout: 120_000 }), failed]);
  return { ctx, page, errors };
}

/** Waits for `n` animation frames inside the page. */
export const frames = (page: Page, n: number): Promise<void> =>
  page.evaluate((k) => new Promise<void>((resolve) => { let left = k; const f = () => (--left <= 0 ? resolve() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

/** Taps or holds touch points through CDP, so several fingers can be down at once. */
export async function touch(ctx: BrowserContext, page: Page) {
  const cdp = await ctx.newCDPSession(page);
  return (type: 'touchStart' | 'touchMove' | 'touchEnd', points: { x: number; y: number; id: number }[]) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
}
