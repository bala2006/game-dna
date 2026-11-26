/** Typed error codes from PRD section 8, plus a few generic ones for input handling. */
export const ERROR_CODES = [
  'UNSUPPORTED_ENGINE',
  'ADAPTER_MISSING',
  'INVALID_PARAMETER',
  'SESSION_NOT_READY',
  'STALE_BASELINE',
  'TIMEOUT',
  'PERMISSION_DENIED',
  'UNSTABLE_REPLAY',
  'ASSET_LICENSE_UNKNOWN',
  'INVALID_INPUT',
  'INVALID_TRANSITION',
  'NOT_FOUND',
  'LIMIT_EXCEEDED',
  /** An engine adapter answered a bridge request with an error; its own code is in `details.adapterCode`. */
  'ADAPTER_ERROR',
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
