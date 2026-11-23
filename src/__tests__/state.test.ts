import { describe, expect, it } from 'vitest';
import { localDateKey } from '../lib/dates';
import { computeDerived } from '../store/derived';
import { createDemoState, createFreshState, loadState, reducer } from '../store/state';

const NOW = new Date(2026, 10, 23, 15, 0).getTime(); // Monday afternoon
const DAY = 24 * 60 * 60 * 1000;
const today = localDateKey(NOW);

describe('reducer', () => {
  it('keeps history across days and derives today from it', () => {
    let s = createFreshState(NOW);
    s = reducer(s, { type: 'addMitzvah', payload: { title: 'צדקה', icon: 'charity', points: 15 }, now: NOW - DAY });
    s = reducer(s, { type: 'addMitzvah', payload: { title: 'חסד', icon: 'heart', points: 15 }, now: NOW });
    const d = computeDerived(s, today);
    expect(s.logs).toHaveLength(2);
    expect(d.todayCount).toBe(1);
    expect(d.totalPoints).toBe(30);
    expect(d.activityStreak).toBe(2);
  });

  it('allows more than 100 blessings', () => {
    let s = createFreshState(NOW);
    for (let i = 0; i < 105; i += 1) s = reducer(s, { type: 'addBlessing', payload: { category: 'enjoyment' }, now: NOW });
    const d = computeDerived(s, today);
    expect(d.blessingTotal).toBe(105);
    expect(d.blessingCounts.enjoyment).toBe(105);
  });

  it('removes a log and its points', () => {
    let s = reducer(createFreshState(NOW), { type: 'completeTorah', now: NOW });
    expect(computeDerived(s, today).torahCompletedToday).toBe(true);
    s = reducer(s, { type: 'removeLog', payload: { id: s.logs[0]!.id } });
    const d = computeDerived(s, today);
    expect(d.torahCompletedToday).toBe(false);
    expect(d.totalPoints).toBe(0);
  });

  it('records daily Torah only once per day', () => {
    let s = createFreshState(NOW);
    s = reducer(s, { type: 'completeTorah', now: NOW });
    s = reducer(s, { type: 'completeTorah', now: NOW + 1000 });
    expect(s.logs).toHaveLength(1);
  });

  it('torah streak requires consecutive days', () => {
    let s = createFreshState(NOW);
    s = reducer(s, { type: 'completeTorah', now: NOW - 3 * DAY }); // Friday
    s = reducer(s, { type: 'completeTorah', now: NOW - DAY }); // Sunday (Shabbat skipped)
    s = reducer(s, { type: 'completeTorah', now: NOW });
    expect(computeDerived(s, today).torahStreak).toBe(3);
    // Five days later without learning → the streak is gone.
    expect(computeDerived(s, localDateKey(NOW + 5 * DAY)).torahStreak).toBe(0);
  });

  it('weekly progress resets on a new week', () => {
    const s = reducer(createFreshState(NOW), {
      type: 'addMitzvah',
      payload: { title: 'x', icon: 'heart', points: 1 },
      now: NOW,
    });
    expect(computeDerived(s, today).week.total).toBe(1);
    expect(computeDerived(s, localDateKey(NOW + 7 * DAY)).week.total).toBe(0);
  });

  it('clamps goals', () => {
    const s = reducer(createFreshState(NOW), { type: 'updateGoals', payload: { dailyGoal: 0, blessingGoal: 1000 } });
    expect(s.dailyGoal).toBe(1);
    expect(s.blessingGoal).toBe(300);
  });

  it('persists settings', () => {
    const s = reducer(createFreshState(NOW), { type: 'updateSettings', payload: { notifications: false } });
    expect(loadState(JSON.stringify(s), NOW).settings).toEqual({ notifications: false, privateProfile: true });
  });
});

describe('loading', () => {
  it('starts fresh without stored data', () => {
    expect(loadState(null, NOW).onboarded).toBe(false);
  });

  it('migrates v1 data and keeps the points total', () => {
    const v1 = {
      version: 1,
      todayKey: today,
      userName: 'יאיר',
      points: 7230,
      dailyLogs: [
        { id: 'a', title: 'נתינת צדקה', icon: 'charity', points: 15, createdAt: NOW, time: '15:00' },
        { id: 'b', title: 'ברכה אחרונה', icon: 'food', points: 5, createdAt: NOW + 1, time: '15:00' },
      ],
      blessingLogs: [{ id: 'x', title: 'ברכה אחרונה', category: 'enjoyment', createdAt: NOW + 1, time: '15:00' }],
      reflection: 'מחשבה',
    };
    const s = loadState(JSON.stringify(v1), NOW);
    const d = computeDerived(s, today);
    expect(s.version).toBe(2);
    expect(s.onboarded).toBe(true);
    expect(d.totalPoints).toBe(7230);
    expect(d.blessingTotal).toBe(1);
    expect(s.logs.find((l) => l.id === 'a')?.actionKey).toBe('charity');
    expect(d.reflection).toBe('מחשבה');
  });

  it('demo state has history and no Shabbat activity', () => {
    const s = createDemoState(NOW);
    expect(s.logs.length).toBeGreaterThan(50);
    expect(s.logs.every((l) => new Date(l.createdAt).getDay() !== 6)).toBe(true);
    expect(s.logs.every((l) => l.createdAt <= NOW)).toBe(true);
  });
});
