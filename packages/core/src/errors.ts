/** Typed error codes for GameDNA utilities. Each failure names its code so callers never mistake it for a pass. */
export const ERROR_CODES = [
  'INVALID_PARAMETER',
  'PERMISSION_DENIED',
  'INVALID_INPUT',
  'NOT_FOUND',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export class GameDNAError extends Error {
  readonly code: ErrorCode;
  readonly details: Record<string, unknown> | undefined;
  readonly fix: string | undefined;

  constructor(code: ErrorCode, message: string, options: { details?: Record<string, unknown>; fix?: string } = {}) {
    super(message);
    this.name = 'GameDNAError';
    this.code = code;
    this.details = options.details;
    this.fix = options.fix;
  }

  toJSON(): Record<string, unknown> {
    return {
      code: this.code,
      message: this.message,
      ...(this.fix ? { fix: this.fix } : {}),
      ...(this.details ? { details: this.details } : {}),
    };
  }
}

export function isGameDNAError(value: unknown): value is GameDNAError {
  return value instanceof GameDNAError;
}
