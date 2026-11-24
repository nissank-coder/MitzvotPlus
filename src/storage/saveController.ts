import { ActivityLog } from '../types';
import { StateStorage } from './persistence';

/**
 * Reliable saving (code review finding 6): failures are never swallowed.
 * - status: idle → saving → saved | error, observable by the UI
 * - automatic retry with back-off, plus manual retry; the latest state is always the one written
 * - writes never overlap; a change during a save triggers one more save afterwards
 * - retries are idempotent: storage.save writes the full current state (SQLite rows are upserts,
 *   localStorage is overwritten), so repeating it never duplicates actions
 */
export type SaveErrorKind = 'quota' | 'storage';

export type SaveStatus = {
  state: 'idle' | 'saving' | 'saved' | 'error';
  error: SaveErrorKind | null;
  /** Consecutive failed attempts since the last success. */
  failures: number;
  lastSavedAt: number | null;
};

type SaveableState = { logs: ActivityLog[] } & Record<string, unknown>;

export type SaveControllerOptions = {
  debounceMs?: number;
  /** Delays before automatic retries; after the last one, only a manual retry or a new change saves. */
  retryDelaysMs?: number[];
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  now?: () => number;
};

export function classifySaveError(error: unknown): SaveErrorKind {
  const e = error as { name?: string; message?: string; code?: unknown } | undefined;
  const text = `${e?.name ?? ''} ${e?.message ?? ''} ${String(e?.code ?? '')}`.toLowerCase();
  if (/quota|disk is full|database or disk is full|sqlite_full|no space|enospc/.test(text)) return 'quota';
  return 'storage';
}

export class SaveController {
  private latest: SaveableState | null = null;
  private dirty = false;
  private inFlight: Promise<boolean> | null = null;
  private timer: unknown = null;
  private savedIds = new Set<string>();
  private status: SaveStatus = { state: 'idle', error: null, failures: 0, lastSavedAt: null };
  private readonly opts: Required<SaveControllerOptions>;

  constructor(
    private readonly storage: StateStorage,
    private readonly onStatus: (s: SaveStatus) => void,
    options: SaveControllerOptions = {},
  ) {
    this.opts = {
      debounceMs: options.debounceMs ?? 250,
      retryDelaysMs: options.retryDelaysMs ?? [2_000, 5_000, 15_000, 60_000],
      setTimer: options.setTimer ?? ((fn, ms) => setTimeout(fn, ms)),
      clearTimer: options.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>)),
      now: options.now ?? (() => Date.now()),
    };
  }

  /** Marks the state loaded from storage as already saved. */
  markLoaded(state: SaveableState): void {
    this.savedIds = new Set(state.logs.map((l) => l.id));
  }

  getStatus(): SaveStatus {
    return this.status;
  }

  /** True when this action is known to be on disk. */
  isSaved(logId: string): boolean {
    return this.savedIds.has(logId);
  }

  /** A new state to persist (debounced). */
  request(state: SaveableState): void {
    this.latest = state;
    this.dirty = true;
    this.schedule(this.opts.debounceMs);
  }

  /** Saves now (e.g. when the app goes to the background). Resolves true when everything is on disk. */
  async flush(): Promise<boolean> {
    this.cancelTimer();
    if (this.inFlight) await this.inFlight;
    if (!this.dirty || !this.latest) return this.status.state !== 'error';
    const run = this.saveOnce();
    this.inFlight = run;
    const ok = await run;
    this.inFlight = null;
    if (ok && this.dirty) return this.flush(); // a change arrived during the save
    return ok;
  }

  /** Manual retry from the UI. */
  retry(): Promise<boolean> {
    return this.flush();
  }

  dispose(): void {
    this.cancelTimer();
  }

  private async saveOnce(): Promise<boolean> {
    const state = this.latest!;
    this.dirty = false;
    this.setStatus({ ...this.status, state: 'saving' });
    try {
      await this.storage.save(state);
      this.savedIds = new Set(state.logs.map((l) => l.id));
      this.setStatus({ state: 'saved', error: null, failures: 0, lastSavedAt: this.opts.now() });
      return true;
    } catch (error) {
      console.warn('Save failed', error);
      this.dirty = true; // still not on disk
      const failures = this.status.failures + 1;
      this.setStatus({ ...this.status, state: 'error', error: classifySaveError(error), failures });
      const delay = this.opts.retryDelaysMs[failures - 1];
      if (delay !== undefined) this.schedule(delay);
      return false;
    }
  }

  private schedule(ms: number): void {
    this.cancelTimer();
    this.timer = this.opts.setTimer(() => {
      this.timer = null;
      void this.flush();
    }, ms);
  }

  private cancelTimer(): void {
    if (this.timer !== null) {
      this.opts.clearTimer(this.timer);
      this.timer = null;
    }
  }

  private setStatus(s: SaveStatus): void {
    this.status = s;
    this.onStatus(s);
  }
}
