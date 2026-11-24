/** Player-facing comfort settings persisted per game in localStorage. */
export interface ComfortSettings {
  reducedMotion: boolean;
  muted: boolean;
}

export function loadSettings(gameId: string): ComfortSettings {
  const fallback: ComfortSettings = {
    reducedMotion: typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)').matches : false,
    muted: false,
  };
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(`${gameId}:settings`);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<ComfortSettings>;
    return {
      reducedMotion: typeof parsed.reducedMotion === 'boolean' ? parsed.reducedMotion : fallback.reducedMotion,
      muted: typeof parsed.muted === 'boolean' ? parsed.muted : fallback.muted,
    };
  } catch {
    return fallback;
  }
}

export function saveSettings(gameId: string, s: ComfortSettings): void {
  try {
    localStorage.setItem(`${gameId}:settings`, JSON.stringify(s));
  } catch {
    // Storage can be unavailable (private mode, sandboxed iframe). Settings then last for the session.
  }
}
