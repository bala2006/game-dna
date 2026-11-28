import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import type { z } from 'zod';
import { GameDNAError } from '../errors.js';
import { formatIssues } from '../schemas.js';

export function readJsonFile<T>(file: string, schema: z.ZodType<T>, label = path.basename(file)): T {
  if (!existsSync(file)) throw new GameDNAError('NOT_FOUND', `${label} not found`, { details: { file } });
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    throw new GameDNAError('INVALID_INPUT', `${label} is not valid JSON: ${(err as Error).message}`);
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new GameDNAError('INVALID_INPUT', `${label} failed schema validation`, { details: { issues: formatIssues(parsed.error) } });
  return parsed.data;
}

export function readJsonRaw(file: string): unknown {
  return JSON.parse(readFileSync(file, 'utf8'));
}

/** Write JSON atomically: temp file in the same directory, then rename. */
export function writeJsonAtomic(file: string, data: unknown): void {
  writeFileAtomic(file, `${JSON.stringify(data, null, 2)}\n`);
}

export function writeFileAtomic(file: string, contents: string | Uint8Array): void {
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${randomBytes(4).toString('hex')}.tmp`);
  try {
    writeFileSync(tmp, contents);
    renameSync(tmp, file);
  } catch (err) {
    if (existsSync(tmp)) unlinkSync(tmp);
    throw err;
  }
}

export function sha256(data: string | Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

/** Short random ID suffix for traces and generated artifacts. */
export function newId(prefix: string, now = new Date()): string {
  const stamp = now.toISOString().replace(/[-:T]/g, '').slice(0, 14);
  return `${prefix}-${stamp}-${randomBytes(3).toString('hex')}`;
}
