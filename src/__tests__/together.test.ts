import { describe, expect, it } from 'vitest';
import { isCodeShape, localLearningDays, normalizeCode } from '../backend/together';
import { partialText } from '../screens/TogetherScreen';
// @ts-expect-error – plain .mjs build helper
import { cspFor } from '../../scripts/csp.mjs';

/** "לומדים יחד" – the parts of the challenge the app computes itself (the server counts the real numbers). */
describe('learning together – on the device', () => {
  it('a code as typed or pasted becomes the server form; only the 8-character shape is accepted', () => {
    expect(normalizeCode(' abcd-2345 ')).toBe('ABCD2345');
    expect(isCodeShape('ABCD2345')).toBe(true);
    expect(isCodeShape('ABCD1234')).toBe(false); // 1 is not in the alphabet (looks like I)
    expect(isCodeShape('ABC2345')).toBe(false);
  });

  it("this device's learning days: one per day, learning only, inside the window, never after today", () => {
    const logs = [
      { actionKey: 'torahStudy', dateKey: '2026-11-27' },
      { actionKey: 'learningTrack', dateKey: '2026-11-27' }, // same day: once
      { actionKey: 'mitzvahStudy', dateKey: '2026-11-28' },
      { actionKey: 'shacharit', dateKey: '2026-11-29' }, // a prayer is not learning
      { actionKey: 'torahStudy', dateKey: '2026-11-26' }, // before the start
      { actionKey: 'dailyTorah', dateKey: '2026-12-04' }, // after the end
    ] as const;
    expect(localLearningDays([...logs], '2026-11-27', '2026-12-03', '2026-11-30')).toBe(2);
    expect(localLearningDays([...logs], null, null, '2026-11-30')).toBe(0);
  });

  it('partial progress is said in words – before the goal too', () => {
    expect(partialText(0, 3)).toMatch(/עוד לא נספר/);
    expect(partialText(1, 3)).toBe('יום לימוד אחד מתוך 3 – עוד 2 ימים');
    expect(partialText(2, 3)).toBe('2 ימי לימוד מתוך 3 – עוד יום אחד');
    expect(partialText(3, 3)).toMatch(/השלמת 3 ימי לימוד/);
  });

  it("WebAssembly is allowed only in a web staging build that asks for the browser SQLite", () => {
    const staging = { VITE_BACKEND_ENV: 'staging', VITE_SUPABASE_URL: 'https://abc.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_x' };
    expect(cspFor({})).not.toMatch(/wasm/);
    expect(cspFor({ VITE_WEB_SQLITE: 'true' })).not.toMatch(/wasm/); // production: never
    expect(cspFor(staging)).not.toMatch(/wasm/);
    expect(cspFor({ ...staging, VITE_WEB_SQLITE: 'true' })).toMatch(/script-src 'self' 'wasm-unsafe-eval'/);
  });
});
