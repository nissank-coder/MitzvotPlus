/**
 * Private speech-guard (shmirat halashon) timer. Local only: never synced, shared or sent to analytics
 * (spec §3, decision D10). Elapsed time is always derived from the stored instant, never accumulated.
 */
export type SpeechTimer = {
  /** When the current period started; null until the user starts the timer. */
  since: number | null;
  /** Longest completed period. */
  bestMs: number;
  /** Number of completed periods (resets). */
  resets: number;
  /** Sum of completed periods; null when unknown (data from before this field existed). */
  completedMs: number | null;
  /** Previous state, kept briefly so a reset can be undone. */
  undo: (Omit<SpeechTimer, 'undo'> & { at: number }) | null;
};

export const UNDO_WINDOW_MS = 10 * 60 * 1000;

export const emptyTimer = (): SpeechTimer => ({ since: null, bestMs: 0, resets: 0, completedMs: 0, undo: null });

export function startTimer(t: SpeechTimer, now: number): SpeechTimer {
  return t.since === null ? { ...t, since: now, undo: null } : t;
}

/** A screen clock may lag the stored instant by a moment (e.g. right after a reset): not a clock problem. */
export const CLOCK_TOLERANCE_MS = 5_000;

/** Elapsed time; a device clock set back before the start yields 0 and a flag, never a negative value. */
export function elapsed(t: SpeechTimer, now: number): { ms: number; clockMovedBack: boolean } {
  if (t.since === null) return { ms: 0, clockMovedBack: false };
  const diff = now - t.since;
  if (diff >= 0) return { ms: diff, clockMovedBack: false };
  return { ms: 0, clockMovedBack: diff < -CLOCK_TOLERANCE_MS };
}

/** Ends the current period and starts a new one. */
export function resetTimer(t: SpeechTimer, now: number): SpeechTimer {
  if (t.since === null) return t;
  const { ms } = elapsed(t, now);
  const { undo: _ignored, ...previous } = t;
  void _ignored;
  return {
    since: now,
    bestMs: Math.max(t.bestMs, ms),
    resets: t.resets + 1,
    completedMs: t.completedMs === null ? null : t.completedMs + ms,
    undo: { ...previous, at: now },
  };
}

export function canUndo(t: SpeechTimer, now: number): boolean {
  // A few seconds of tolerance: the screen's clock may lag the moment of the reset slightly.
  return t.undo !== null && now - t.undo.at >= -5_000 && now - t.undo.at <= UNDO_WINDOW_MS;
}

export function undoReset(t: SpeechTimer, now: number): SpeechTimer {
  if (!canUndo(t, now) || !t.undo) return t;
  const { at: _at, ...restored } = t.undo;
  void _at;
  return { ...restored, undo: null };
}

/** Average completed period, or null when it cannot be computed honestly. */
export function averageMs(t: SpeechTimer): number | null {
  if (t.resets === 0 || t.completedMs === null) return null;
  return t.completedMs / t.resets;
}

/** Best period including the running one. */
export function bestIncludingCurrent(t: SpeechTimer, now: number): number {
  return Math.max(t.bestMs, elapsed(t, now).ms);
}
