/**
 * Browser end-to-end test of Ridgeline Racer, the GameDNA Kit driving app (needs `npm run build`
 * and `npx playwright install chromium`). Drives the built game with keyboard, mouse look, a stub
 * gamepad and multi-finger touch, and checks state through the `?dev` hook.
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import type { Browser, Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auditTouchLayout } from '@gamedna/kit/input';
import { frames, launchChromium, openGame, serveDist, touch } from './kit-browser.js';

const root = path.resolve(import.meta.dirname, '../..');
const shots = path.join(root, '.scratch', 'ridgeline-racer-shots');
mkdirSync(shots, { recursive: true });

type State = { phase: string; idx: number; speed: number; steer: number; offroad: boolean; paused: boolean; car: [number, number]; heading: number; view: string; device: string; camera: [number, number, number] };
type Win = { __game: { state: State; input: { raw: { look: { x: number } } }; carSize(): Record<string, number> & { spec: Record<string, number> }; touchLayout(): Parameters<typeof auditTouchLayout>[0] }; __pad: { connected: boolean; axes: number[]; buttons: { value: number }[] } };

let browser: Browser;
let server: Awaited<ReturnType<typeof serveDist>>;
const state = (page: Page) => page.evaluate(() => (window as unknown as Win).__game.state);
const until = (page: Page, fn: () => boolean, timeout = 180_000) => page.waitForFunction(fn, null, { timeout, polling: 100 });
const racing = (page: Page) => until(page, () => (window as unknown as Win).__game.state.phase === 'racing');
const bearing = (s: State) => { const b = Math.atan2(s.car[0] - s.camera[0], s.car[1] - s.camera[2]) - s.heading; return Math.abs(Math.atan2(Math.sin(b), Math.cos(b))); };

beforeAll(async () => {
  server = await serveDist(path.join(root, 'apps/ridgeline-racer/dist'));
  browser = await launchChromium();
});
afterAll(async () => {
  await browser?.close();
  await server?.close();
});

describe('ridgeline-racer in Chromium', () => {
  it('drives with keyboard, mouse look and gamepad, and cycles four camera views', async () => {
    const { ctx, page, errors } = await openGame(browser, `${server.url}?dev&quality=low`, { viewport: { width: 960, height: 540 } });
    expect(await page.evaluate(() => !document.querySelector('.gdi-root.on'))).toBe(true);
    const size = await page.evaluate(() => (window as unknown as Win).__game.carSize());
    for (const k of ['length', 'width', 'height']) expect(Math.abs((size[k] ?? 0) / (size.spec[k] ?? 1) - 1), k).toBeLessThan(0.02);

    await racing(page);
    await page.keyboard.down('KeyW');
    await until(page, () => (window as unknown as Win).__game.state.speed > 22);
    expect((await state(page)).device).toBe('keyboard');
    const views: string[] = [];
    for (let i = 0; i < 4; i++) {
      const s = await state(page);
      views.push(s.view);
      await page.screenshot({ path: path.join(shots, `view-${i}-${s.view.replace(/\s+/g, '-').toLowerCase()}.png`) });
      await page.keyboard.press('KeyC');
      await page.waitForFunction((prev) => (window as unknown as Win).__game.state.view !== prev, s.view, { timeout: 60_000, polling: 100 });
    }
    expect(views).toEqual(['Chase', 'Chase far', 'Hood', 'Cockpit']);
    expect((await state(page)).view).toBe('Chase');

    await page.keyboard.down('KeyA');
    await until(page, () => (window as unknown as Win).__game.state.steer > 0.5, 60_000);
    await page.keyboard.up('KeyA');
    await page.keyboard.up('KeyW');
    await frames(page, 2);
    const b0 = bearing(await state(page));
    await page.evaluate(() => { (window as unknown as Win).__game.input.raw.look.x += 400; });
    await frames(page, 2);
    expect(bearing(await state(page)) - b0).toBeGreaterThan(0.4);
    await until(page, () => {
      const s = (window as unknown as Win).__game.state, b = Math.atan2(s.car[0] - s.camera[0], s.car[1] - s.camera[2]) - s.heading;
      return Math.abs(Math.atan2(Math.sin(b), Math.cos(b))) < 0.15;
    });

    await page.keyboard.down('KeyW');
    await page.keyboard.press('KeyP');
    await until(page, () => (window as unknown as Win).__game.state.paused, 60_000);
    const idx = (await state(page)).idx;
    await page.waitForTimeout(1500);
    expect((await state(page)).idx).toBe(idx);
    await page.keyboard.press('KeyP');
    await page.keyboard.up('KeyW');

    await page.evaluate(() => { const pad = (window as unknown as Win).__pad; pad.connected = true; pad.buttons[7]!.value = 1; pad.axes[0] = 0.8; });
    await until(page, () => (window as unknown as Win).__game.state.device === 'gamepad' && (window as unknown as Win).__game.state.steer < -0.3, 60_000);
    expect(await page.textContent('#hint')).toMatch(/RT throttle/);
    expect(errors).toEqual([]);
    await ctx.close();
  }, 900_000);

  it('drives with touch pedals and stick, and its touch layout fits three phone sizes', async () => {
    const { ctx, page, errors } = await openGame(browser, `${server.url}?dev&quality=low`, { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
    expect(await page.evaluate(() => !!document.querySelector('.gdi-root.on'))).toBe(true);
    for (const [w, h] of [[844, 390], [667, 375], [932, 430]] as const) {
      await page.setViewportSize({ width: w, height: h });
      await frames(page, 2);
      const layout = await page.evaluate(() => (window as unknown as Win).__game.touchLayout());
      expect(auditTouchLayout(layout), `${w}x${h}`).toEqual([]);
    }
    await page.setViewportSize({ width: 844, height: 390 });
    await frames(page, 2);
    const box = (id: string) => page.evaluate((i) => { const r = document.querySelector(`.gdi-btn[data-id="${i}"]`)!.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height }; }, id);
    const gas = await box('gas');
    expect(Math.min(gas.w, gas.h)).toBeGreaterThanOrEqual(64);

    await racing(page);
    const t = await touch(ctx, page);
    await t('touchStart', [{ x: gas.x, y: gas.y, id: 1 }]);
    await until(page, () => (window as unknown as Win).__game.state.speed > 10);
    await t('touchStart', [{ x: gas.x, y: gas.y, id: 1 }, { x: 150, y: 260, id: 2 }]);
    await t('touchMove', [{ x: gas.x, y: gas.y, id: 1 }, { x: 205, y: 262, id: 2 }]);
    await until(page, () => (window as unknown as Win).__game.state.steer < -0.3, 60_000);
    await page.screenshot({ path: path.join(shots, 'touch.png') });
    await t('touchEnd', []);
    const v0 = (await state(page)).view, cam = await box('cam');
    await t('touchStart', [{ x: cam.x, y: cam.y, id: 3 }]);
    await t('touchEnd', []);
    await page.waitForFunction((prev) => (window as unknown as Win).__game.state.view !== prev, v0, { timeout: 60_000, polling: 100 });
    expect(await page.textContent('#hint')).toBe('');
    expect(errors).toEqual([]);
    await ctx.close();
  }, 900_000);

  it('lets the automatic driver hold the road at speed', async () => {
    const { ctx, page, errors } = await openGame(browser, `${server.url}?dev&auto=1&quality=low`, { viewport: { width: 960, height: 540 } });
    await racing(page);
    await until(page, () => (window as unknown as Win).__game.state.idx > 120, 600_000);
    const s = await state(page);
    expect(s.offroad).toBe(false);
    expect(s.speed).toBeGreaterThan(30);
    await page.screenshot({ path: path.join(shots, 'auto.png') });
    expect(errors).toEqual([]);
    await ctx.close();
  }, 900_000);
});
