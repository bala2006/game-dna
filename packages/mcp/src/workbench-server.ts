import { randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { GameDNAError, isGameDNAError, metricDeltas, effectiveParameters, recordSelection, type ExperimentRecord } from '@gamedna/core';
import { z } from 'zod';
import { listExperiments, loadDecisions, loadExperiment, saveExperiment } from './project.js';

export interface WorkbenchProject {
  projectId: string;
  name: string;
  root: string;
  relPath: string;
  gameUrl: string | null;
}

export interface WorkbenchDeps {
  projects(): WorkbenchProject[];
  /** Called after the user records a selection, so the decision log is updated. */
  onSelection(projectId: string, exp: ExperimentRecord): void;
  staticDir: string | null;
}

const MIME: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };

const SelectionBody = z.object({ variantId: z.enum(['baseline', 'A', 'B', 'C']).nullable(), rationale: z.string().max(1000).default('') });

function encodeParams(values: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(values), 'utf8').toString('base64url');
}

export function variantPreviewUrl(gameUrl: string, exp: ExperimentRecord, variantId: string, seed: number): string {
  const u = new URL(gameUrl);
  u.searchParams.set('gamedna', '1');
  u.searchParams.set('gdVariant', variantId);
  u.searchParams.set('gdSeed', String(seed));
  const v = exp.variants.find((x) => x.id === variantId);
  if (v && Object.keys(v.parameters).length) u.searchParams.set('gdParams', encodeParams(v.parameters));
  return u.toString();
}

/**
 * Local comparison workbench. Loopback only, per-process token, Host and Origin checks,
 * strict CSP with frames limited to the registered game origins.
 */
export class WorkbenchServer {
  private server: http.Server | null = null;
  private port = 0;
  readonly token = randomBytes(24).toString('hex');

  constructor(private readonly deps: WorkbenchDeps) {}

  get running(): boolean {
    return this.server !== null;
  }

  async start(preferredPort = Number(process.env['GAMEDNA_WORKBENCH_PORT'] ?? 0)): Promise<number> {
    if (this.server) return this.port;
    const server = http.createServer((req, res) => {
      this.handle(req, res).catch((err) => this.json(res, 500, { error: { code: 'INTERNAL', message: (err as Error).message } }));
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(preferredPort, '127.0.0.1', () => resolve());
    });
    this.server = server;
    this.port = (server.address() as { port: number }).port;
    return this.port;
  }

  async stop(): Promise<void> {
    const s = this.server;
    this.server = null;
    if (s) await new Promise<void>((r) => s.close(() => r()));
  }

  url(view: { projectId?: string; experimentId?: string } = {}): string {
    const frag = new URLSearchParams({ token: this.token });
    if (view.projectId) frag.set('project', view.projectId);
    if (view.experimentId) frag.set('experiment', view.experimentId);
    return `http://127.0.0.1:${this.port}/#${frag.toString()}`;
  }

  private headers(): Record<string, string> {
    const origins = [...new Set(this.deps.projects().flatMap((p) => (p.gameUrl ? [new URL(p.gameUrl).origin] : [])))];
    return {
      'Content-Security-Policy': `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-src ${origins.join(' ') || "'none'"}; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Cache-Control': 'no-store',
    };
  }

  private json(res: http.ServerResponse, status: number, body: unknown): void {
    res.writeHead(status, { ...this.headers(), 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(body));
  }

  private authorized(req: http.IncomingMessage): boolean {
    const got = String(req.headers['x-gamedna-token'] ?? '');
    const a = Buffer.from(got);
    const b = Buffer.from(this.token);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  private async body(req: http.IncomingMessage): Promise<unknown> {
    let size = 0;
    const chunks: Buffer[] = [];
    for await (const c of req) {
      size += (c as Buffer).length;
      if (size > 16_384) throw new GameDNAError('LIMIT_EXCEEDED', 'Request body too large');
      chunks.push(c as Buffer);
    }
    return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
  }

  private project(id: string): WorkbenchProject {
    const p = this.deps.projects().find((x) => x.projectId === id);
    if (!p) throw new GameDNAError('NOT_FOUND', `Project ${id} is not registered with this GameDNA server`);
    return p;
  }

  private async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    // DNS-rebinding guard: only our own loopback host is accepted.
    const host = String(req.headers.host ?? '');
    if (host !== `127.0.0.1:${this.port}` && host !== `localhost:${this.port}`) return this.json(res, 421, { error: { code: 'PERMISSION_DENIED', message: 'Unexpected Host header' } });
    const url = new URL(req.url ?? '/', `http://${host}`);

    if (!url.pathname.startsWith('/api/')) return this.serveStatic(url.pathname, res);
    if (!this.authorized(req)) return this.json(res, 401, { error: { code: 'PERMISSION_DENIED', message: 'Missing or wrong session token' } });
    if (req.method !== 'GET') {
      const origin = String(req.headers.origin ?? '');
      if (origin !== `http://${host}`) return this.json(res, 403, { error: { code: 'PERMISSION_DENIED', message: 'Cross-origin state change refused' } });
    }

    try {
      const parts = url.pathname.split('/').filter(Boolean); // api, projects, :pid, experiments, :eid, selection
      if (req.method === 'GET' && url.pathname === '/api/projects') {
        return this.json(res, 200, {
          projects: this.deps.projects().map((p) => ({
            projectId: p.projectId,
            name: p.name,
            relPath: p.relPath,
            gameUrl: p.gameUrl,
            experiments: listExperiments(p.root).map((e) => ({ experimentId: e.experimentId, question: e.question, status: e.status, createdAt: e.createdAt, variantCount: e.variants.length - 1 })),
          })),
        });
      }
      if (parts[0] === 'api' && parts[1] === 'projects' && parts[2]) {
        const p = this.project(parts[2]);
        if (req.method === 'GET' && parts[3] === 'decisions' && parts.length === 4) return this.json(res, 200, loadDecisions(p.root));
        if (parts[3] === 'experiments' && parts[4]) {
          const exp = loadExperiment(p.root, parts[4]);
          if (req.method === 'GET' && parts.length === 5) {
            const seed = 1; // identical seed and start state for every variant
            return this.json(res, 200, {
              experiment: exp,
              gameUrl: p.gameUrl,
              previews: exp.variants.map((v) => ({
                variantId: v.id,
                url: p.gameUrl ? variantPreviewUrl(p.gameUrl, exp, v.id, seed) : null,
                parameters: effectiveParameters(exp, v.id),
                deltas: v.id === 'baseline' ? [] : metricDeltas(exp, v.id),
              })),
            });
          }
          if (req.method === 'POST' && parts[5] === 'selection' && parts.length === 6) {
            const parsed = SelectionBody.safeParse(await this.body(req));
            if (!parsed.success) return this.json(res, 400, { error: { code: 'INVALID_INPUT', message: parsed.error.issues.map((i) => i.message).join('; ') } });
            const updated = recordSelection(exp, { variantId: parsed.data.variantId, rationale: parsed.data.rationale, source: 'workbench' }, new Date().toISOString());
            saveExperiment(p.root, updated);
            this.deps.onSelection(p.projectId, updated);
            return this.json(res, 200, { experiment: updated });
          }
        }
      }
      return this.json(res, 404, { error: { code: 'NOT_FOUND', message: 'Unknown endpoint' } });
    } catch (err) {
      if (isGameDNAError(err)) return this.json(res, err.code === 'NOT_FOUND' ? 404 : 409, { error: err.toJSON() });
      throw err;
    }
  }

  private serveStatic(pathname: string, res: http.ServerResponse): void {
    const dir = this.deps.staticDir;
    if (!dir || !existsSync(dir)) {
      res.writeHead(503, { ...this.headers(), 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('GameDNA workbench assets are not built. Run `npm run build:workbench`.');
      return;
    }
    const rel = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
    const file = path.resolve(dir, rel);
    if (!file.startsWith(path.resolve(dir) + path.sep) || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404, this.headers());
      res.end('Not found');
      return;
    }
    res.writeHead(200, { ...this.headers(), 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  }
}
