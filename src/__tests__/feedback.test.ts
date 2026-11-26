import { describe, expect, it } from 'vitest';
import { computeDerived } from '../store/derived';
import { addedSince, feedbackFor, partialPhrase, snapshotOf } from '../store/feedback';
import { createFreshState, reducer } from '../store/state';
import type { AppState } from '../types';

/**
 * Design round 1.1 – feedback after saved entries is about exactly the entries that were added.
 * R1: round 1 named (and "ביטול" removed) today's newest entry even when the entries just recorded
 * were for Shabbat or a blessing bundle. R3: the blessing goal is announced from any screen.
 */
const NOW = Date.UTC(2026, 10, 29, 8); // Sunday 29.11.2026, 10:00 in Jerusalem
const TODAY = '2026-11-29';
const base = () =>
  reducer(createFreshState(NOW - 10 * 86400000), {
    type: 'completeOnboarding',
    payload: { userName: 'בודק', dailyGoal: 5, profile: { gender: 'male' }, dateKey: '2026-11-15', habits: [{ id: 'three-prayers', perWeek: 7 }, { id: 'learn-daily', perWeek: 7 }] },
  });
const add = (s: AppState, payload: Record<string, unknown>) => reducer(s, { type: 'addAction', payload: { now: NOW, dateKey: TODAY, ...payload } as never });
const run = (before: AppState, after: AppState) => {
  const prev = snapshotOf(before, computeDerived(before, TODAY));
  const added = addedSince(prev, after.logs);
  return feedbackFor(prev, added, after, computeDerived(after, TODAY));
};

describe('feedback after saved entries', () => {
  it('R1: Shabbat entries recorded after the fact – the toast is about them, never about today\'s newest entry', () => {
    const s0 = add(base(), { key: 'shacharit', now: NOW - 3600000 });
    const s1 = reducer(s0, { type: 'addActions', payload: [{ key: 'kiddush', dateKey: '2026-11-28', backfill: true, now: NOW }, { key: 'havdalah', dateKey: '2026-11-28', backfill: true, now: NOW }] as never, markBackfilled: ['2026-11-28'] });
    const f = run(s0, s1)!;
    expect(f.title).toBe('נרשם בדיעבד: 2 רישומים');
    const shacharit = s0.logs.find((l) => l.actionKey === 'shacharit')!;
    expect(f.logIds).not.toContain(shacharit.id);
    expect(f.logIds.sort()).toEqual(s1.logs.filter((l) => l.dateKey === '2026-11-28').map((l) => l.id).sort());
  });
  it('R1: a blessing bundle is one feedback, and undo covers the whole bundle', () => {
    const s0 = add(base(), { key: 'birkatHamazon' });
    const src = s0.logs[0]!;
    const s1 = reducer(s0, { type: 'setBlessingBundle', payload: { sourceLogId: src.id, count: 4, now: NOW + 1000 } });
    const f = run(s0, s1)!;
    expect(f.title).toBe('נרשמו 4 ברכות');
    expect(f.logIds).toHaveLength(4);
    expect(f.logIds).not.toContain(src.id);
  });
  it('R3: the blessing goal is announced whatever screen the 100th blessing came from', () => {
    let s = base();
    for (let i = 0; i < 99; i += 1) s = add(s, { key: 'blessing', category: 'other', now: NOW + i });
    const f = run(s, add(s, { key: 'blessing', category: 'other', now: NOW + 500 }))!;
    expect(f).toMatchObject({ kind: 'goal', title: 'הושלם יעד הברכות: 100' });
    expect(f.logIds).toHaveLength(1);
  });
  it('the goal is announced once: the 101st blessing is a plain entry with the count', () => {
    let s = base();
    for (let i = 0; i < 100; i += 1) s = add(s, { key: 'blessing', category: 'other', now: NOW + i });
    expect(run(s, add(s, { key: 'blessing', category: 'other', now: NOW + 500 }))).toMatchObject({ kind: 'saved', title: 'נרשם: ברכה', detail: '101 מתוך 100 ברכות היום' });
  });
  it('partial progress: one prayer of "three prayers" says how far the habit is', () => {
    const s0 = base();
    expect(run(s0, add(s0, { key: 'mincha' }))).toMatchObject({ kind: 'saved', title: 'נרשם: מנחה', detail: 'תפילה אחת מתוך שלוש היום · עוד 2' });
  });
  it('the entry that completes a habit says so', () => {
    let s = add(add(base(), { key: 'shacharit' }), { key: 'mincha', now: NOW + 10 });
    expect(run(s, (s = add(s, { key: 'arvit', now: NOW + 20 })))).toMatchObject({ kind: 'habit', title: 'הרגל הושלם: שלוש תפילות', detail: 'נרשם: ערבית · 1/2 הרגלים היום' });
  });
  it('entries pulled from another device of the account are not "just recorded": no toast, never undone', () => {
    const s0 = base();
    const local = add(s0, { key: 'mincha' });
    const fromOtherDevice = (s: AppState, id: string): AppState => ({ ...s, logs: [{ ...local.logs[0]!, id, remote: true }, ...s.logs] });
    expect(run(s0, fromOtherDevice(s0, 'remote-1'))).toBeNull();
    const mixed = fromOtherDevice(local, 'remote-2');
    const f = run(s0, mixed)!;
    expect(f.logIds).toEqual([local.logs[0]!.id]);
    expect(f.title).toBe('נרשם: מנחה');
  });
  it('round 14: partial progress in everyday words; a completion always names what was recorded', () => {
    const s0 = base();
    const one = add(s0, { key: 'shacharit' });
    expect(run(s0, one)).toMatchObject({ title: 'נרשם: שחרית', detail: 'תפילה אחת מתוך שלוש היום · עוד 2' });
    const two = add(one, { key: 'mincha', now: NOW + 10 });
    expect(run(one, two)?.detail).toBe('שתי תפילות מתוך שלוש היום · עוד 1');
    expect(partialPhrase({ sel: { id: 'blessings-20' }, title: '20 ברכות ביום', value: 12, needed: 20 })).toBe('12 ברכות מתוך 20 היום');
    expect(partialPhrase({ sel: { id: 'other' }, title: 'משהו', value: 2, needed: 3 })).toBe('משהו: 2 מתוך 3');
    const three = add(two, { key: 'arvit', now: NOW + 20 });
    const f = run(three, add(three, { key: 'torahStudy', now: NOW + 30 }))!;
    expect(f).toMatchObject({ kind: 'goal', title: 'היעד היומי הושלם' });
    expect(f.detail).toContain('נרשם: לימוד תורה');
  });
  it('nothing added – no feedback', () => {
    const s = base();
    expect(run(s, s)).toBeNull();
  });
});
