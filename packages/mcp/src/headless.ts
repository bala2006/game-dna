import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { GameDNAError, type GameHarness, type ProjectRecord } from '@gamedna/core';
import { resolveInside } from '@gamedna/core/node';
import { resolveFromProject } from './project.js';

type HarnessCtor = new () => GameHarness;

interface ViteLike {
  ssrLoadModule(url: string): Promise<Record<string, unknown>>;
  close(): Promise<void>;
}

const servers = new Map<string, Promise<ViteLike>>();

/**
 * Load the game's simulation class through the project's own Vite (SSR module loading), so
 * scenarios can run in Node without a browser. Only the declared harness module is loaded.
 */
export async function loadHarness(root: string, record: ProjectRecord): Promise<() => GameHarness> {
  if (!record.harness) {
    throw new GameDNAError('ADAPTER_MISSING', 'project.json has no "harness" entry, so headless runs are unavailable', {
      fix: 'Add "harness": { "module": "src/game/sim.ts", "export": "YourSim" } or start a browser session with gd_start_session.',
    });
  }
  const modulePath = resolveInside(root, record.harness.module);
  const viteEntry = resolveFromProject(root, 'vite');
  if (!viteEntry) throw new GameDNAError('ADAPTER_MISSING', 'Vite is not installed in the project, so the harness module cannot be loaded headlessly', { fix: 'Install vite as a dev dependency or use a browser session.' });

  let server = servers.get(root);
  if (!server) {
    server = (async () => {
      const vite = (await import(pathToFileURL(viteEntry).href)) as { createServer: (o: Record<string, unknown>) => Promise<ViteLike> };
      return vite.createServer({
        root,
        configFile: false,
        logLevel: 'silent',
        appType: 'custom',
        server: { middlewareMode: true, hmr: false, watch: null },
        optimizeDeps: { noDiscovery: true, include: [] },
      });
    })();
    servers.set(root, server);
  }
  const vite = await server;
  const mod = await vite.ssrLoadModule(`/${path.relative(root, modulePath).split(path.sep).join('/')}`);
  const Ctor = mod[record.harness.export] as HarnessCtor | undefined;
  if (typeof Ctor !== 'function') {
    throw new GameDNAError('ADAPTER_MISSING', `Export "${record.harness.export}" not found in ${record.harness.module}`);
  }
  return () => new Ctor();
}

/** Drop cached modules so the next run sees edited source and tuning files. */
export async function invalidateHarness(root: string): Promise<void> {
  const server = servers.get(root);
  if (!server) return;
  servers.delete(root);
  await (await server).close();
}

export async function closeAllHarnesses(): Promise<void> {
  const all = [...servers.values()];
  servers.clear();
  await Promise.allSettled(all.map(async (s) => (await s).close()));
}
