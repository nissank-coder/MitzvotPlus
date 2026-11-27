import { describe, expect, it } from 'vitest';
import { computeDerived } from '../store/derived';
import { createFreshState, reducer } from '../store/state';
import { goalsOn } from '../lib/metrics';
import { habitSelectionOn } from '../lib/habits';

/**
 * Round 13 (review U1) – the habit editor keeps every choice. Reproduced on main b0c7e22 with the
 * review's probe (docs/review-r13/evidence/appendix-b-probes-main-b0c7e22.json: weeklyHabitLost):
 * the editor started from today's due habits, so "save" without a change dropped a weekly habit,
 * and tefillin on Shabbat.
 */
const SHABBAT = '2026-11-28';
const SUNDAY = '2026-11-29';
const habits = [
  { id: 'learn-daily', perWeek: 7 },
  { id: 'tefillin', perWeek: 7 },
  { id: 'gratitude', perWeek: 3 },
];
const onboarded = () =>
  reducer(createFreshState(Date.parse('2026-11-20T08:00:00Z')), {
    type: 'completeOnboarding',
    payload: { userName: 'בודק', dailyGoal: 5, profile: { gender: 'male', cityId: 'jerusalem' }, dateKey: '2026-11-20', habits },
  });

describe('U1 – the habit editor keeps every choice', () => {
  it('on Shabbat the editor starts with the daily habits, the weekly one and tefillin (not due today)', () => {
    const s = onboarded();
    const d = computeDerived(s, SHABBAT, (k) => k === SHABBAT, SHABBAT);
    // What Home shows as today's goal: tefillin is not due, gratitude is weekly.
    expect(d.habitsToday.map((h) => h.sel.id)).toEqual(['learn-daily']);
    // What the editor starts from: the whole choice.
    expect(habitSelectionOn(s.goalHistory, SHABBAT).habits).toEqual(habits);
  });

  it('"save" without a change changes nothing: no habit is lost, no new snapshot, the target is kept', () => {
    let s = onboarded();
    s = reducer(s, { type: 'setHabits', payload: { habits, habitTarget: 2 }, dateKey: '2026-11-21' });
    const before = s.goalHistory;
    const unchanged = habitSelectionOn(s.goalHistory, SHABBAT).habits;
    s = reducer(s, { type: 'setHabits', payload: { habits: unchanged }, dateKey: SHABBAT });
    expect(s.goalHistory).toBe(before);
    expect(goalsOn(s.goalHistory, SUNDAY).habits).toEqual(habits);
    expect(goalsOn(s.goalHistory, SUNDAY).habitTarget).toBe(2);
  });

  it('a real change still applies from today on, and the other habits stay', () => {
    let s = onboarded();
    const next = [...habitSelectionOn(s.goalHistory, SHABBAT).habits, { id: 'tehillim', perWeek: 7 }];
    s = reducer(s, { type: 'setHabits', payload: { habits: next }, dateKey: SHABBAT });
    expect(goalsOn(s.goalHistory, SHABBAT).habits?.map((h) => h.id)).toEqual(['learn-daily', 'tefillin', 'gratitude', 'tehillim']);
    expect(goalsOn(s.goalHistory, '2026-11-27').habits).toEqual(habits);
  });
});
