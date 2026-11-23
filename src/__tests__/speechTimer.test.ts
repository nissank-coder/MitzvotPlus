import { describe, expect, it } from 'vitest';
import { averageMs, bestIncludingCurrent, canUndo, elapsed, emptyTimer, resetTimer, startTimer, undoReset, UNDO_WINDOW_MS } from '../lib/speechTimer';
import { createFreshState, loadState } from '../store/state';

const H = 3_600_000;
const D = 24 * H;

describe('speech timer', () => {
  it('does not run until the user starts it', () => {
    const t = emptyTimer();
    expect(elapsed(t, 5 * D).ms).toBe(0);
    expect(resetTimer(t, 5 * D)).toBe(t);
    expect(createFreshState(1000).speech.since).toBeNull();
  });

  it('derives elapsed time from the stored instant', () => {
    const t = startTimer(emptyTimer(), 1000);
    expect(elapsed(t, 1000 + 3 * D).ms).toBe(3 * D);
    expect(startTimer(t, 99_999)).toBe(t); // starting twice keeps the first start
  });

  it('a clock set back before the start gives 0, never a negative duration', () => {
    const t = startTimer(emptyTimer(), 10 * D);
    expect(elapsed(t, 9 * D)).toEqual({ ms: 0, clockMovedBack: true });
    const r = resetTimer(t, 9 * D);
    expect(r.bestMs).toBe(0);
    expect(r.completedMs).toBe(0);
  });

  it('reset records best, count and average', () => {
    let t = startTimer(emptyTimer(), 0);
    t = resetTimer(t, 2 * D);
    t = resetTimer(t, 2 * D + 4 * D);
    expect(t).toMatchObject({ bestMs: 4 * D, resets: 2, completedMs: 6 * D, since: 6 * D });
    expect(averageMs(t)).toBe(3 * D);
    expect(bestIncludingCurrent(t, 6 * D + 5 * D)).toBe(5 * D);
  });

  it('undo restores the previous period inside the window only', () => {
    const start = startTimer(emptyTimer(), 0);
    const r = resetTimer(start, 3 * D);
    expect(canUndo(r, 3 * D + 60_000)).toBe(true);
    expect(undoReset(r, 3 * D + 60_000)).toEqual({ ...start, undo: null });
    expect(canUndo(r, 3 * D + UNDO_WINDOW_MS + 1)).toBe(false);
    expect(undoReset(r, 3 * D + UNDO_WINDOW_MS + 1)).toBe(r);
  });

  it('migrates the old flat fields without inventing an average', () => {
    const old = { ...createFreshState(0), version: 2, onboarded: true, speech: undefined, lashonHaraSince: 1000, lashonHaraBestMs: 5 * D, lashonHaraResets: 2 };
    const s = loadState(JSON.stringify(old), 10 * D);
    expect(s.speech).toEqual({ since: 1000, bestMs: 5 * D, resets: 2, completedMs: null, undo: null });
    expect(averageMs(s.speech)).toBeNull();
    expect('lashonHaraSince' in s).toBe(false);
  });

  it('never leaves the device: not part of any activity event', () => {
    let s = createFreshState(0);
    s = { ...s, speech: resetTimer(startTimer(s.speech, 0), D) };
    expect(s.logs).toHaveLength(0);
  });
});
