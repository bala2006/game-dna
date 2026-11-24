import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { GameDNAError } from '../errors.js';

function isWithin(root: string, target: string): boolean {
  const rel = path.relative(root, target);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/** Resolve the deepest existing ancestor through realpath so symlinks cannot escape the root. */
function realpathOfExistingPrefix(target: string): string {
  let current = target;
  const rest: string[] = [];
  while (!existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) break;
    rest.unshift(path.basename(current));
    current = parent;
  }
  return path.join(realpathSync(current), ...rest);
}

/**
 * Resolve `relative` inside `root`. Rejects absolute paths outside the root, ".." traversal
 * and symlinks whose real target is outside the root.
 */
export function resolveInside(root: string, relative: string): string {
  if (relative.includes('\0')) throw new GameDNAError('PERMISSION_DENIED', 'Path contains a NUL byte');
  const realRoot = realpathSync(root);
  const candidate = path.resolve(realRoot, relative);
  if (!isWithin(realRoot, candidate)) {
    throw new GameDNAError('PERMISSION_DENIED', `Path "${relative}" is outside the project root`, { fix: 'Use a path inside the registered project.' });
  }
  const real = realpathOfExistingPrefix(candidate);
  if (!isWithin(realRoot, real)) {
    throw new GameDNAError('PERMISSION_DENIED', `Path "${relative}" resolves through a symlink outside the project root`);
  }
  return real;
}

export function isInside(root: string, candidate: string): boolean {
  try {
    const realRoot = realpathSync(root);
    return isWithin(realRoot, realpathOfExistingPrefix(path.resolve(candidate)));
  } catch {
    return false;
  }
}
