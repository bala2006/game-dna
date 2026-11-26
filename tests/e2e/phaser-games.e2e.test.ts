/**
 * Browser smoke test of the production builds of the two Phaser games (needs `npm run build` and
 * `npx playwright install chromium`). Each game must draw its canvas, start from the title screen
 * on a key press and keep running without page errors.
 */
import path from 'node:path';
import type { Browser } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { launchChromium, serveDist } from './kit-browser.js';

const root = path.resolve(import.meta.dirname, '../..');
let browser: Browser;

beforeAll(async () => {
  browser = await launchChromium();
});
afterAll(async () => {
  await browser?.close();
});

describe('Phaser production builds', () => {
  for (const app of ['gravity-shift', 'neon-survivor']) {
    it(`${app} loads, starts on a key press and runs without page errors`, async () => {
      const server = await serveDist(path.join(root, 'apps', app, 'dist'));
      const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
      const errors: string[] = [];
      page.on('pageerror', (err) => errors.push(String(err)));
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
      try {
        await page.goto(server.url);
        await page.waitForSelector('canvas', { timeout: 60_000 });
        await page.waitForTimeout(800);
        await page.keyboard.press('Enter');
        await page.keyboard.down('ArrowRight');
        await page.waitForTimeout(1200);
        await page.keyboard.up('ArrowRight');
        const size = await page.evaluate(() => {
          const c = document.querySelector('canvas');
          return c ? { w: c.width, h: c.height } : null;
        });
        expect(size?.w).toBeGreaterThan(0);
        expect(size?.h).toBeGreaterThan(0);
        expect(errors).toEqual([]);
      } finally {
        await page.close();
        await server.close();
      }
    });
  }
});
