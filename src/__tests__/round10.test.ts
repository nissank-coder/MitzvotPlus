import { describe, expect, it } from 'vitest';
import * as habitsLib from '../lib/habits';
import { computeDerived } from '../store/derived';
import { createFreshState, reducer } from '../store/state';
import type { AppState } from '../types';

/**
 * Round 10 (S10-01) – habit contracts. Each test failed on main 854493c
 * (evidence/round-10/round10-tests-on-main.txt).
 */
const NOW = Date.UTC(2026, 10, 24, 10); // Tuesday 24.11.2026
const DAY = 86_400_000;
const TODAY = '2026-11-24';
type AddPayload = Extract<Parameters<typeof reducer>[1], { type: 'addAction' }>['payload'];
const add = (s: AppState, p: Partial<AddPayload> & { key: AddPayload['key'] }) =>
  reducer(s, { type: 'addAction', payload: { now: NOW, dateKey: TODAY, ...p } });
const withHabits = (habits: Array<{ id: string; perWeek?: number }>, memberSince = NOW) => ({
  ...reducer(createFreshState(NOW), {
    type: 'completeOnboarding',
    payload: { userName: 'QA', dailyGoal: 12, profile: {}, habits: habits.map((h) => ({ id: h.id, perWeek: h.perWeek ?? 7 })) },
  }),
  memberSince,
});
const d = (s: AppState, today = TODAY, rest?: (k: string) => boolean) => computeDerived(s, today, rest);
const plan = (id: string) => (habitsLib as unknown as { recordPlan?: (id: string) => unknown }).recordPlan?.(id);

describe('S10-01 learn-track', () => {
  it('"I did it" for a fixed learning track opens the learning screen instead of logging general learning', () => {
    expect(plan('learn-track')).toEqual({ kind: 'open', feature: 'learning' });
  });
  it('general learning does not advance the learning-track habit; a track entry does', () => {
    let s = withHabits([{ id: 'learn-track' }]);
    s = add(s, { key: 'torahStudy' });
    expect(d(s).habitsToday[0]!.done).toBe(false);
    s = add(s, { key: 'learningTrack', refId: `mishna:${TODAY}` });
    expect(d(s).habitsToday[0]!.done).toBe(true);
  });
});

describe('S10-01 three prayers', () => {
  it('asks which prayer was said – never records one that was not chosen', () => {
    expect(plan('three-prayers')).toEqual({ kind: 'choose', actions: ['shacharit', 'mincha', 'arvit'] });
    expect(plan('prayer-any')).toEqual({ kind: 'choose', actions: ['shacharit', 'mincha', 'arvit', 'musaf'] });
  });
  it('3/3 only with three different real prayers', () => {
    let s = withHabits([{ id: 'three-prayers' }]);
    s = add(s, { key: 'arvit' });
    s = add(s, { key: 'arvit', now: NOW + 1 });
    expect(d(s).habitsToday[0]!.value).toBe(1);
    s = add(s, { key: 'shacharit' });
    s = add(s, { key: 'mincha' });
    expect(d(s).habitsToday[0]).toMatchObject({ value: 3, done: true });
  });
});

describe('S10-01 weekly frequency', () => {
  it('a 3-a-week habit is not part of the daily goal and is measured in the week', () => {
    let s = withHabits([{ id: 'chesed' }, { id: 'gratitude', perWeek: 3 }]);
    s = add(s, { key: 'chesed' });
    const r = d(s);
    expect(r.todayGoalMet).toBe(true); // daily habit done; the weekly one does not block the day
    expect(r.habitTarget).toBe(1);
    const weekly = r.weeklyHabits.find((h: { sel: { id: string } }) => h.sel.id === 'gratitude');
    expect(weekly).toMatchObject({ daysThisWeek: 0, perWeek: 3 });
  });
  it('with weekly habits only, a day without them is neutral – never a missed day', () => {
    let s = withHabits([{ id: 'gratitude', perWeek: 3 }], NOW - 3 * DAY);
    s = add(s, { key: 'gratitude', dateKey: '2026-11-22' });
    const r = d(s);
    expect(r.consistencyDays.eligibleDays).toBe(1); // only the day the habit was done
    expect(r.consistencyDays.goalDays).toBe(1);
    expect(r.weeklyHabits[0]).toMatchObject({ daysThisWeek: 1 });
  });
  it('the frequency chosen earlier is kept as it was', () => {
    const s = withHabits([{ id: 'gratitude', perWeek: 5 }]);
    expect(s.goalHistory[0]!.habits).toEqual([{ id: 'gratitude', perWeek: 5 }]);
  });
});

describe('S10-01 rest days', () => {
  it('tefillin is not expected on Shabbat: another habit done on Shabbat meets the goal', () => {
    const shabbat = '2026-11-21';
    let s = withHabits([{ id: 'tefillin' }, { id: 'learn-daily' }], NOW - 10 * DAY);
    s = add(s, { key: 'torahStudy', dateKey: shabbat });
    const rest = (k: string) => k === shabbat;
    expect(d(s, TODAY, rest).progressContext.goalMet(shabbat)).toBe(true);
  });
});

describe('evidence files stay well-formed', async () => {
  const { readdirSync, readFileSync } = await import('node:fs');
  const parse = (text: string) => {
    const rows: string[][] = [];
    let row: string[] = [], field = '', q = false;
    for (let i = 0; i < text.length; i += 1) {
      const c = text[i]!;
      if (q) {
        if (c === '"' && text[i + 1] === '"') { field += '"'; i += 1; } else if (c === '"') q = false; else field += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (c !== '\r') field += c;
    }
    if (field || row.length) { row.push(field); rows.push(row); }
    return rows.filter((r) => r.length > 1);
  };
  const dir = 'docs/mobile-readiness';
  it.each(readdirSync(dir).filter((f) => f.endsWith('.csv')))('%s: every row has the header\'s column count', (f) => {
    const [head, ...rows] = parse(readFileSync(`${dir}/${f}`, 'utf8'));
    expect(rows.filter((r) => r.length !== head!.length).map((r) => r[0])).toEqual([]);
  });
});
