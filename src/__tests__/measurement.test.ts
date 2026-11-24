import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isRestDayKey } from '../lib/jewishCalendar';
import { goalsOn, measureDays, scoreLogs, tehillimChaptersRead, tehillimRefId, withGoals } from '../lib/metrics';
import { bestStreak, currentStreak } from '../lib/progress';
import { computeDerived } from '../store/derived';
import { createFreshState, loadState, reducer } from '../store/state';
import type { ActivityLog, AppState } from '../types';

const NOW = Date.UTC(2026, 10, 23, 12); // Monday
const DAY = 86_400_000;
const TODAY = '2026-11-23';
const add = (s: AppState, payload: Parameters<typeof reducer>[1] extends infer A ? (A extends { type: 'addAction'; payload: infer P } ? P : never) : never) =>
  reducer(s, { type: 'addAction', payload });
const blessings = (s: AppState, n: number, at = NOW, dateKey = TODAY) => {
  for (let i = 0; i < n; i += 1) s = add(s, { key: 'blessing', category: 'other', now: at + i, dateKey });
  return s;
};

describe('PR A – points shown equal the engine', () => {
  it('the blessings screen reads its numbers from the scoring table', () => {
    const src = readFileSync('src/screens/BlessingsScreen.tsx', 'utf8');
    expect(src).not.toMatch(/\d+ נקודות לכל ברכה/);
    expect(src).toContain('ACTIONS.blessing.points');
  });
});

describe('PR A – blessing-goal bonus: one per day, deterministic', () => {
  it('remove one of the first 99 and add another: still exactly one bonus', () => {
    let s = blessings(createFreshState(NOW), 100);
    expect(computeDerived(s, TODAY).blessingGoalBonusToday).toBe(30);
    const before = computeDerived(s, TODAY).todayPoints;
    const early = s.logs[s.logs.length - 10]!;
    s = reducer(s, { type: 'removeLog', payload: { id: early.id } });
    expect(computeDerived(s, TODAY).blessingGoalBonusToday).toBe(0); // 99 < 100
    s = blessings(s, 1, NOW + 500);
    const d = computeDerived(s, TODAY);
    expect(d.blessingGoalBonusToday).toBe(30);
    expect(d.todayPoints).toBe(before);
  });

  it('does not depend on the order entries were added', () => {
    const s = blessings(createFreshState(NOW), 101);
    const a = scoreLogs(s.logs, s.goalHistory);
    const b = scoreLogs([...s.logs].reverse(), s.goalHistory);
    expect(a.total).toBe(b.total);
  });

  it('raising the goal today removes today’s bonus but not yesterday’s', () => {
    let s = blessings(createFreshState(NOW), 100, NOW - DAY, '2026-11-22');
    s = blessings(s, 100);
    s = reducer(s, { type: 'updateGoals', payload: { blessingGoal: 150 }, dateKey: TODAY });
    const sheet = scoreLogs(s.logs, s.goalHistory);
    expect(sheet.dayBonus.get('2026-11-22')).toBe(30);
    expect(sheet.dayBonus.has(TODAY)).toBe(false);
  });

  it('back-filled blessings on a past day are judged by that day’s goal', () => {
    let s = reducer(createFreshState(NOW), { type: 'updateGoals', payload: { blessingGoal: 50 }, dateKey: TODAY });
    s = blessings(s, 60, NOW, '2026-11-20');
    expect(scoreLogs(s.logs, s.goalHistory).dayBonus.has('2026-11-20')).toBe(false); // goal was 100 then
  });
});

describe('PR A – separate measures', () => {
  it('12 blessings are 1 distinct action, not 12', () => {
    let s = blessings(createFreshState(NOW), 12);
    s = add(s, { key: 'charity', now: NOW });
    const d = computeDerived(s, TODAY);
    expect(d.todayCount).toBe(2);
    expect(d.todayEntries).toBe(13);
    expect(d.blessingTotal).toBe(12);
  });

  it('the same prayer from the siddur and from home is recorded once', () => {
    let s = add(createFreshState(NOW), { key: 'shacharit', now: NOW });
    s = add(s, { key: 'shacharit', now: NOW + 60_000 });
    expect(s.logs).toHaveLength(1);
  });

  it('general learning and completing a specific item are different actions', () => {
    let s = add(createFreshState(NOW), { key: 'torahStudy', now: NOW });
    expect(computeDerived(s, TODAY).torahCompletedToday).toBe(false);
    expect(computeDerived(s, TODAY).learnedToday).toBe(true);
    s = add(s, { key: 'dailyTorah', content: { id: 'dvar-torah/x', version: '2' }, now: NOW });
    const log = s.logs.find((l) => l.actionKey === 'dailyTorah')!;
    expect(log.refId).toBe('dvar-torah/x@2');
    expect(computeDerived(s, TODAY).torahCompletedToday).toBe(true);
  });

  it('on-time is kept on the entry and scored from it', () => {
    const s = add(createFreshState(NOW), { key: 'shacharit', onTime: true, minyan: true, now: NOW });
    expect(s.logs[0]).toMatchObject({ onTime: true, minyan: true, points: 40 });
    expect(add(createFreshState(NOW), { key: 'mincha', onTime: true, now: NOW }).logs[0]!.onTime).toBeUndefined();
  });
});

describe('PR A – blessing bundles for a prayer', () => {
  it('confirming again replaces the number; removing the prayer removes its bundle', () => {
    let s = add(createFreshState(NOW), { key: 'shacharit', now: NOW });
    const prayer = s.logs[0]!;
    s = reducer(s, { type: 'setBlessingBundle', payload: { sourceLogId: prayer.id, count: 18, now: NOW } });
    s = reducer(s, { type: 'setBlessingBundle', payload: { sourceLogId: prayer.id, count: 19, now: NOW } });
    expect(computeDerived(s, TODAY).blessingTotal).toBe(19);
    s = blessings(s, 2);
    expect(computeDerived(s, TODAY).blessingTotal).toBe(21);
    s = reducer(s, { type: 'removeLog', payload: { id: prayer.id } });
    expect(computeDerived(s, TODAY).blessingTotal).toBe(2);
  });
});

describe('PR A – goals per period', () => {
  it('a goal change applies from that day on', () => {
    const h = withGoals([{ from: '0000-00-00', dailyGoal: 12, weeklyGoal: 60, blessingGoal: 100 }], TODAY, {
      dailyGoal: 3,
      weeklyGoal: 15,
      blessingGoal: 100,
    });
    expect(goalsOn(h, '2026-11-22').dailyGoal).toBe(12);
    expect(goalsOn(h, TODAY).dailyGoal).toBe(3);
  });

  it('lowering the goal today does not turn past days into "goal reached"', () => {
    let s = createFreshState(NOW);
    for (const [i, key] of (['charity', 'chesed', 'parents'] as const).entries()) s = add(s, { key, now: NOW - DAY + i, dateKey: '2026-11-22' });
    const before = computeDerived(s, TODAY).consistencyDays.goalDays;
    s = reducer(s, { type: 'updateGoals', payload: { dailyGoal: 3 }, dateKey: TODAY });
    expect(computeDerived(s, TODAY).consistencyDays.goalDays).toBe(before);
  });
});

describe('PR A – one rest-day rule (Shabbat and Yom Tov)', () => {
  // Rosh Hashana 5787: Sat 12 + Sun 13 September 2026.
  const rest = (k: string) => isRestDayKey(k, true);
  const days = new Set(['2026-09-10', '2026-09-11', '2026-09-14']);

  it('a Yom Tov next to Shabbat does not break the streak', () => {
    expect(currentStreak(days, '2026-09-14', rest)).toBe(3);
    expect(bestStreak(days, rest)).toBe(3);
    expect(currentStreak(days, '2026-09-14')).toBe(1); // the old Shabbat-only rule broke here
  });

  it('a rest day with nothing recorded is not a missed day for consistency', () => {
    let s = createFreshState(NOW);
    for (const k of ['2026-09-10', '2026-09-11', '2026-09-14']) s = add(s, { key: 'charity', now: NOW, dateKey: k });
    s = { ...s, goalHistory: [{ from: '0000-00-00', dailyGoal: 1, weeklyGoal: 5, blessingGoal: 100 }] };
    const d = computeDerived(s, '2026-09-14', rest);
    // Measured from the first recorded day (10.9): 10, 11, 14 – Rosh Hashana 12–13 not missed days.
    expect(d.consistencyDays.eligibleDays).toBe(3);
    expect(d.consistencyDays.goalDays).toBe(3);
  });
});

describe('PR A – Tehillim by chapter', () => {
  it('the same portion twice a day counts once; chapters are unioned over time', () => {
    let s = add(createFreshState(NOW), { key: 'tehillim', refId: tehillimRefId([{ from: 1, to: 9 }]), now: NOW });
    s = add(s, { key: 'tehillim', refId: tehillimRefId([{ from: 1, to: 9 }]), now: NOW + 1 });
    expect(s.logs).toHaveLength(1);
    s = add(s, { key: 'tehillim', refId: tehillimRefId([{ from: 5, to: 12 }]), now: NOW + DAY, dateKey: '2026-11-24' });
    s = add(s, { key: 'tehillim', refId: tehillimRefId([{ from: 119, to: 119, verses: [1, 96] }]), now: NOW + DAY, dateKey: '2026-11-24' });
    const read = tehillimChaptersRead(s.logs, (c) => (c === 119 ? 176 : 10));
    expect(read).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]); // 119 only half read
  });
});

describe('PR A – migration keeps data and does not rewrite history', () => {
  const legacy: ActivityLog[] = [
    // Old rules stored the goal bonus on the 3rd blessing (goal 3).
    { id: 'b1', title: 'ברכה', icon: 'cup', points: 2, createdAt: NOW, dateKey: TODAY, kind: 'blessing', actionKey: 'blessing' },
    { id: 'b2', title: 'ברכה', icon: 'cup', points: 2, createdAt: NOW + 1, dateKey: TODAY, kind: 'blessing', actionKey: 'blessing' },
    { id: 'b3', title: 'ברכה', icon: 'cup', points: 32, createdAt: NOW + 2, dateKey: TODAY, kind: 'blessing', actionKey: 'blessing' },
  ];
  const stored = { ...createFreshState(NOW), blessingGoal: 3, logs: legacy, torahSaved: true } as unknown as Record<string, unknown>;
  delete stored.goalHistory;
  delete stored.savedContent;

  it('loads older v2 data: goals history created, logs untouched, the old flag dropped', () => {
    const s = loadState(JSON.stringify(stored), NOW);
    expect(s.logs).toEqual(legacy);
    expect(s.goalHistory).toEqual([{ from: '0000-00-00', dailyGoal: 12, weeklyGoal: 60, blessingGoal: 3 }]);
    expect(s.savedContent).toEqual([]);
    expect('torahSaved' in s).toBe(false);
    expect(computeDerived(s, TODAY).todayPoints).toBe(36); // frozen as stored
  });

  it('a new blessing on a legacy day does not add a second bonus', () => {
    let s = loadState(JSON.stringify(stored), NOW);
    s = blessings(s, 1, NOW + 10);
    const d = computeDerived(s, TODAY);
    expect(d.blessingGoalBonusToday).toBe(0);
    expect(d.todayPoints).toBe(38);
  });

  it('measureDays counts legacy blessings too', () => {
    expect(measureDays(legacy).get(TODAY)).toMatchObject({ blessings: 3, distinctActions: 1, entries: 3 });
  });
});
