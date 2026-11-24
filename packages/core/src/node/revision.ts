import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolveInside } from './paths.js';

/**
 * Content revision of the files that define a baseline. Any edit to one of them changes the
 * revision, which is how stale experiment selections are detected (GD-034).
 */
export function computeRevision(root: string, files: readonly string[]): string {
  const h = createHash('sha256');
  for (const rel of [...files].sort()) {
    const abs = resolveInside(root, rel);
    h.update(rel);
    h.update('\0');
    h.update(existsSync(abs) ? readFileSync(abs) : Buffer.from('<missing>'));
    h.update('\0');
  }
  return `sha256:${h.digest('hex').slice(0, 24)}`;
}
