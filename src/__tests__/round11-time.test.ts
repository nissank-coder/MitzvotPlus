import { describe, expect, it } from 'vitest';
import { cityDateKey, isRestDayKey } from '../lib/jewishCalendar';
import { computeDerived } from '../store/derived';
import { createFreshState, reducer } from '../store/state';
import { restRuleFor } from '../lib/restRule';

/** Round 11 §6 – day boundary (civil date in the city's time zone, D06 still a draft), DST, time zones, rest days. */
describe('day boundary in the city time zone', () => {
  it('Israel, the night the clock goes back (25.10.2026): midnight still splits the days correctly', () => {
    expect(cityDateKey(new Date('2026-10-24T20:59:00Z'), 'Asia/Jerusalem')).toBe('2026-10-24'); // 23:59 IDT
    expect(cityDateKey(new Date('2026-10-24T21:00:00Z'), 'Asia/Jerusalem')).toBe('2026-10-25'); // 00:00 IDT
    expect(cityDateKey(new Date('2026-10-25T21:59:00Z'), 'Asia/Jerusalem')).toBe('2026-10-25'); // 23:59 IST
    expect(cityDateKey(new Date('2026-10-25T22:00:00Z'), 'Asia/Jerusalem')).toBe('2026-10-26'); // 00:00 IST
  });
  it('Israel, the night the clock goes forward (27.3.2026)', () => {
    expect(cityDateKey(new Date('2026-03-26T21:59:00Z'), 'Asia/Jerusalem')).toBe('2026-03-26');
    expect(cityDateKey(new Date('2026-03-26T22:00:00Z'), 'Asia/Jerusalem')).toBe('2026-03-27');
  });
  it('the same moment is a different day in New York and Jerusalem', () => {
    const t = new Date('2026-11-24T04:30:00Z');
    expect(cityDateKey(t, 'America/New_York')).toBe('2026-11-23');
    expect(cityDateKey(t, 'Asia/Jerusalem')).toBe('2026-11-24');
  });
});

describe('streaks around Shabbat, Yom Tov and a city change', () => {
  const NOW = Date.UTC(2026, 8, 16, 10);
  const add = (s: ReturnType<typeof createFreshState>, dateKey: string) =>
    reducer(s, { type: 'addAction', payload: { key: 'chesed', now: NOW, dateKey } });
  it('Rosh Hashana + Shabbat (12–13.9.2026) do not break a streak; diaspora second day of Sukkot is a rest day abroad only', () => {
    let s = createFreshState(NOW - 10 * 86_400_000);
    for (const k of ['2026-09-10', '2026-09-11', '2026-09-14']) s = add(s, k);
    const rest = restRuleFor(s.locationHistory, s.profile.cityId);
    expect(computeDerived(s, '2026-09-14', rest).activityStreak).toBe(3);
    expect(isRestDayKey('2026-09-27', false)).toBe(true);
    expect(isRestDayKey('2026-09-27', true)).toBe(false);
  });
});

describe('achievements after deleting the entry that earned them (current default, decision pending)', () => {
  it('an earned achievement stays; progress shown is recomputed from the log', () => {
    const NOW = Date.UTC(2026, 10, 24, 10);
    let s = reducer(createFreshState(NOW), {
      type: 'completeOnboarding',
      payload: { userName: 'QA', dailyGoal: 12, profile: {}, habits: [{ id: 'chesed', perWeek: 7 }] },
    });
    s = reducer(s, { type: 'addAction', payload: { key: 'chesed', now: NOW, dateKey: '2026-11-24' } });
    s = reducer(s, { type: 'grantAwards', payload: [{ achievementId: 'A01', version: 1, earnedAt: NOW, rulesVersion: 'score-3' }] });
    s = reducer(s, { type: 'removeLog', payload: { id: s.logs[0]!.id } });
    const a01 = computeDerived(s, '2026-11-24').achievements.find((a) => a.def.id === 'A01')!;
    expect(a01.earned).not.toBeNull(); // kept (option A in round-11/time-and-gameplay-decisions.md)
    expect(a01.value).toBe(0); // the live value is recomputed
    expect(a01.ready).toBe(false); // and it is never granted twice
  });
});
