/**
 * Browser end-to-end test of Trail Walk, the GameDNA Kit on-foot app (needs `npm run build` and
 * `npx playwright install chromium`). Covers third and first person, keyboard and mouse look, a stub
 * gamepad, multi-finger touch and the collect loop, through the `?dev` hook.
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import type { Browser, Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auditTouchLayout } from '@gamedna/kit/input';
import { frames, launchChromium, openGame, serveDist, touch } from './kit-browser.js';

const root = path.resolve(import.meta.dirname, '../..');
const shots = path.join(root, '.scratch', 'trail-walk-shots');
mkdirSync(shots, { recursive: true });

type State = { x: number; y: number; z: number; facing: number; speed: number; grounded: boolean; view: string; cameraYaw: number; camera: [number, number, number]; headVisible: boolean; device: string; paused: boolean; eye: number; count: number };
type Game = { state: State; input: { raw: { look: { x: number } } }; touchLayout(): Parameters<typeof auditTouchLayout>[0]; standAtMarker(i: number): void };
type Win = { __game: Game; __pad: { connected: boolean; axes: number[]; buttons: { value: number }[] } };

let browser: Browser;
let server: Awaited<ReturnType<typeof serveDist>>;
const state = (page: Page) => page.evaluate(() => (window as unknown as Win).__game.state);
const until = (page: Page, fn: (arg: number) => boolean, arg = 0, timeout = 120_000) => page.waitForFunction(fn, arg, { timeout, polling: 100 });

beforeAll(async () => {
  server = await serveDist(path.join(root, 'apps/trail-walk/dist'));
  browser = await launchChromium();
});
afterAll(async () => {
  await browser?.close();
  await server?.close();
});

describe('trail-walk in Chromium', () => {
  it('walks, looks, jumps and switches between third and first person on keyboard, mouse and gamepad', async () => {
    const { ctx, page, errors } = await openGame(browser, `${server.url}?dev&quality=low`, { viewport: { width: 960, height: 540 } });
    await frames(page, 2);
    let s = await state(page);
    expect(s.view).toBe('Third person');
    expect(s.headVisible).toBe(true);
    const a = { x: s.x, z: s.z, yaw: s.cameraYaw };
    await page.keyboard.down('KeyW');
    await until(page, () => (window as unknown as Win).__game.state.speed > 2.5);
    await page.screenshot({ path: path.join(shots, 'third-person.png'), timeout: 120_000 });
    await page.keyboard.up('KeyW');
    s = await state(page);
    const dx = s.x - a.x, dz = s.z - a.z, d = Math.hypot(dx, dz);
    expect(d).toBeGreaterThan(0.3);
    expect((dx * Math.sin(a.yaw) + dz * Math.cos(a.yaw)) / d).toBeGreaterThan(0.9);

    await until(page, () => (window as unknown as Win).__game.state.speed < 0.05);
    const y0 = (await state(page)).cameraYaw;
    await page.evaluate(() => { (window as unknown as Win).__game.input.raw.look.x += 300; });
    await frames(page, 2);
    expect(Math.abs((await state(page)).cameraYaw - y0)).toBeGreaterThan(0.5);

    await page.keyboard.press('KeyV');
    await until(page, () => (window as unknown as Win).__game.state.view === 'First person');
    await frames(page, 2);
    s = await state(page);
    expect(s.headVisible).toBe(false);
    expect(Math.abs(s.camera[1] - s.y - s.eye)).toBeLessThan(0.02);
    const f0 = s.facing;
    await page.evaluate(() => { (window as unknown as Win).__game.input.raw.look.x -= 600; });
    await until(page, (f) => Math.abs((window as unknown as Win).__game.state.facing - f) > 0.8, f0);
    await page.evaluate(() => { (window as unknown as Win).__game.input.raw.look.x += 600; });
    await frames(page, 3);
    await page.screenshot({ path: path.join(shots, 'first-person.png'), timeout: 120_000 });

    await page.keyboard.press('Space');
    await until(page, () => !(window as unknown as Win).__game.state.grounded);
    await until(page, () => (window as unknown as Win).__game.state.grounded);
    await page.keyboard.press('KeyV');
    await until(page, () => (window as unknown as Win).__game.state.view === 'Third person' && (window as unknown as Win).__game.state.headVisible);

    await page.evaluate(() => { const pad = (window as unknown as Win).__pad; pad.connected = true; pad.axes[1] = -1; });
    await until(page, () => (window as unknown as Win).__game.state.device === 'gamepad' && (window as unknown as Win).__game.state.speed > 2);
    expect(await page.textContent('#hint')).toMatch(/Left stick move/);
    await page.evaluate(() => { const pad = (window as unknown as Win).__pad; pad.axes[1] = 0; pad.buttons[9]!.value = 1; });
    await until(page, () => (window as unknown as Win).__game.state.paused);
    await page.evaluate(() => { (window as unknown as Win).__pad.buttons[9]!.value = 0; });
    expect(errors).toEqual([]);
    await ctx.close();
  }, 900_000);

  it('collects a marker with E only when standing next to it', async () => {
    const { ctx, page, errors } = await openGame(browser, `${server.url}?dev&quality=low`, { viewport: { width: 960, height: 540 } });
    await frames(page, 2);
    await page.keyboard.press('KeyE');
    await frames(page, 3);
    expect((await state(page)).count).toBe(0);
    await page.evaluate(() => (window as unknown as Win).__game.standAtMarker(0));
    await until(page, () => getComputedStyle(document.querySelector('#prompt')!).display === 'block');
    expect(await page.textContent('#prompt')).toBe('E collect');
    await page.screenshot({ path: path.join(shots, 'marker.png'), timeout: 120_000 });
    await page.keyboard.press('KeyE');
    await until(page, () => (window as unknown as Win).__game.state.count === 1);
    await until(page, () => document.querySelector('#count')!.textContent === '1/8');
    expect(errors).toEqual([]);
    await ctx.close();
  }, 600_000);

  it('walks and looks with two fingers on touch, and its touch layout fits three phone sizes', async () => {
    const { ctx, page, errors } = await openGame(browser, `${server.url}?dev&quality=low`, { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
    expect(await page.evaluate(() => !!document.querySelector('.gdi-root.on'))).toBe(true);
    for (const [w, h] of [[844, 390], [667, 375], [932, 430]] as const) {
      await page.setViewportSize({ width: w, height: h });
      await frames(page, 2);
      expect(auditTouchLayout(await page.evaluate(() => (window as unknown as Win).__game.touchLayout())), `${w}x${h}`).toEqual([]);
    }
    await page.setViewportSize({ width: 844, height: 390 });
    await frames(page, 2);
    const t = await touch(ctx, page);
    await t('touchStart', [{ x: 150, y: 270, id: 1 }]);
    await t('touchMove', [{ x: 150, y: 205, id: 1 }]);
    await until(page, () => (window as unknown as Win).__game.state.speed > 2);
    const y0 = (await state(page)).cameraYaw;
    await t('touchStart', [{ x: 150, y: 205, id: 1 }, { x: 560, y: 180, id: 2 }]);
    for (const x of [600, 640, 680]) await t('touchMove', [{ x: 150, y: 205, id: 1 }, { x, y: 180, id: 2 }]);
    await frames(page, 2);
    expect(Math.abs((await state(page)).cameraYaw - y0)).toBeGreaterThan(0.3);
    await page.screenshot({ path: path.join(shots, 'touch.png'), timeout: 120_000 });
    await t('touchEnd', []);
    const view = await page.evaluate(() => { const r = document.querySelector('.gdi-btn[data-id="cam"]')!.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    await t('touchStart', [{ x: view.x, y: view.y, id: 3 }]);
    await t('touchEnd', []);
    await until(page, () => (window as unknown as Win).__game.state.view === 'First person');
    expect(errors).toEqual([]);
    await ctx.close();
  }, 900_000);
});
