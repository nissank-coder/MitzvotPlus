import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { elapsed, resetTimer, startTimer, emptyTimer } from '../lib/speechTimer';
import { spanParts } from '../screens/LashonHaraScreen';
import { readingMinutes } from '../screens/TorahScreen';

const MIN = 60_000;
const H = 60 * MIN;
const D = 24 * H;

describe('design round 1 – speech guard', () => {
  it('shows the time since the last recorded reset in its largest unit', () => {
    expect(spanParts(3 * D + 4 * H + 12 * MIN)).toEqual({ value: 3, unit: 'ימים', rest: '4 שעות · 12 דקות' });
    expect(spanParts(D)).toMatchObject({ value: 1, unit: 'יום' });
    expect(spanParts(5 * H + 2 * MIN)).toEqual({ value: 5, unit: 'שעות', rest: '2 דקות' });
    expect(spanParts(30 * 1000)).toMatchObject({ value: 0, unit: 'דקות' });
  });
  it('right after a reset the screen clock may lag a moment: no false "clock moved back" warning', () => {
    const t = resetTimer(startTimer(emptyTimer(), 0), 10 * D);
    expect(elapsed(t, 10 * D - 800)).toEqual({ ms: 0, clockMovedBack: false });
    expect(elapsed(t, 10 * D - 60_000)).toEqual({ ms: 0, clockMovedBack: true }); // a real clock change
  });
  it('the time is derived from the stored instant – correct after the app comes back from the background', () => {
    const t = startTimer(emptyTimer(), 1_000);
    expect(elapsed(t, 1_000 + 2 * D + 3 * H).ms).toBe(2 * D + 3 * H); // no ticks needed in between
  });
});

describe('design round 1 – Dvar Torah', () => {
  it('reading time is an estimate of at least one minute', () => {
    expect(readingMinutes('')).toBe(1);
    expect(readingMinutes(Array.from({ length: 510 }, () => 'מילה').join(' '))).toBe(3);
  });
  it('opening the screen records nothing: learning is recorded only by the explicit button', () => {
    const src = readFileSync('src/screens/TorahScreen.tsx', 'utf8');
    const calls = src.match(/addAction\('dailyTorah'/g) ?? [];
    expect(calls).toHaveLength(1);
    expect(src).toMatch(/onClick=\{\(\) => addAction\('dailyTorah'/);
    expect(src).not.toMatch(/useEffect\([^)]*addAction/s);
  });
});
