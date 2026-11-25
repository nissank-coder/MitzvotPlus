import { describe, expect, it } from 'vitest';
import { ideaForDay, loadPracticalIdeas } from '../content/practical';
import { ACHIEVEMENTS, CHALLENGES, journeyStage } from '../lib/challenges';
import { cleanHabits, HABIT_DOMAINS, HABITS } from '../lib/habits';
import { computeDerived } from '../store/derived';
import { createFreshState, loadState, reducer } from '../store/state';
import type { AppState } from '../types';

const NOW = Date.UTC(2026, 10, 23, 12); // Monday 23.11.2026
const DAY = 86_400_000;
const TODAY = '2026-11-23';
type AddPayload = Extract<Parameters<typeof reducer>[1], { type: 'addAction' }>['payload'];
const add = (s: AppState, p: Partial<AddPayload> & { key: AddPayload['key'] }) =>
  reducer(s, { type: 'addAction', payload: { now: NOW, dateKey: TODAY, ...p } });
const d = (s: AppState, today = TODAY) => computeDerived(s, today);
const onboard = (habits: string[], now = NOW) =>
  reducer(createFreshState(now), {
    type: 'completeOnboarding',
    payload: { userName: 'QA', dailyGoal: 12, profile: {}, habits: habits.map((id) => ({ id, perWeek: 7 })) },
  });

describe('catalog sizes (round 9 minimums)', () => {
  it('at least 15 habits across the 7 domains', () => {
    expect(HABITS.length).toBeGreaterThanOrEqual(15);
    expect(new Set(HABITS.map((h) => h.domain))).toEqual(new Set(Object.keys(HABIT_DOMAINS)));
  });
  it('at least 8 personal challenges and 12 active achievements; group ones are not active', () => {
    expect(CHALLENGES.filter((c) => c.scope === 'personal').length).toBeGreaterThanOrEqual(8);
    expect(ACHIEVEMENTS.filter((a) => !a.future).length).toBeGreaterThanOrEqual(12);
  });
});

describe('habits', () => {
  it('a new user picks three habits; the daily goal is 3 habits, progress from the log', () => {
    let s = onboard(['prayer-any', 'learn-daily', 'chesed']);
    expect(d(s).hasHabits).toBe(true);
    expect([d(s).habitsDoneToday, d(s).habitTarget]).toEqual([0, 3]);
    s = add(s, { key: 'mincha' });
    expect(d(s).habitsToday.find((h) => h.sel.id === 'prayer-any')?.done).toBe(true);
    expect(d(s).habitsDoneToday).toBe(1);
    s = add(s, { key: 'torahStudy' });
    s = add(s, { key: 'parents' });
    expect(d(s).todayGoalMet).toBe(true);
  });

  it('12 blessings still count once toward a blessings habit and not for other habits', () => {
    let s = onboard(['blessings-20', 'learn-daily']);
    for (let i = 0; i < 12; i += 1) s = add(s, { key: 'blessing', category: 'other', now: NOW + i });
    const h = d(s).habitsToday.find((x) => x.sel.id === 'blessings-20')!;
    expect([h.value, h.needed, h.done]).toEqual([12, 20, false]);
    expect(d(s).todayPoints).toBe(24); // score unchanged
  });

  it('changing habits applies from today; yesterday keeps the habits it had', () => {
    let s = onboard(['chesed'], NOW - 2 * DAY);
    s = add(s, { key: 'chesed', dateKey: '2026-11-22' });
    expect(d(s).progressContext.goalMet('2026-11-22')).toBe(true);
    s = reducer(s, { type: 'setHabits', payload: { habits: [{ id: 'learn-daily', perWeek: 7 }] }, dateKey: TODAY });
    expect(d(s).progressContext.goalMet('2026-11-22')).toBe(true);
    expect(d(s).habitsToday.map((h) => h.sel.id)).toEqual(['learn-daily']);
  });

  it('cleanHabits drops unknown and duplicate ids, keeps at most 5, clamps frequency', () => {
    expect(
      cleanHabits([
        { id: 'chesed', perWeek: 9 },
        { id: 'chesed', perWeek: 3 },
        { id: 'nope', perWeek: 7 },
        { id: 'gratitude', perWeek: 0 },
      ]),
    ).toEqual([
      { id: 'chesed', perWeek: 7 },
      { id: 'gratitude', perWeek: 1 },
    ]);
  });

  it('an existing user keeps history and the old goal until choosing habits', () => {
    const old = { ...createFreshState(NOW), onboarded: true, logs: add(createFreshState(NOW), { key: 'charity' }).logs } as Record<string, unknown>;
    delete old.challenges;
    delete old.awards;
    const s = loadState(JSON.stringify(old), NOW);
    expect(s.logs).toHaveLength(1);
    expect(s.challenges).toEqual([]);
    expect(d(s).hasHabits).toBe(false);
    expect(d(s).todayCount).toBe(1);
  });
});

describe('challenges', () => {
  it('joining starts today; only entries from the joining day on count; progress from the log', () => {
    let s = onboard(['learn-daily'], NOW - 3 * DAY);
    s = add(s, { key: 'torahStudy', dateKey: '2026-11-22' }); // before joining – not counted
    s = reducer(s, { type: 'joinChallenge', payload: { definitionId: 'C04', now: NOW }, dateKey: TODAY });
    expect(d(s).challenges[0]).toMatchObject({ value: 0, target: 3, state: 'active', daysLeft: 7 });
    s = add(s, { key: 'torahStudy' });
    s = add(s, { key: 'learningTrack', refId: 'x', dateKey: '2026-11-24', now: NOW + DAY });
    expect(d(s, '2026-11-24').challenges[0]!.value).toBe(2);
    // Same day twice is still one learning day.
    s = add(s, { key: 'mitzvahStudy', refId: 'm1', dateKey: '2026-11-24', now: NOW + DAY });
    expect(d(s, '2026-11-24').challenges[0]!.value).toBe(2);
  });

  it('completion is stored once; leaving keeps history; the same challenge cannot run twice', () => {
    let s = onboard(['learn-daily']);
    s = reducer(s, { type: 'joinChallenge', payload: { definitionId: 'C06', now: NOW }, dateKey: TODAY });
    const again = reducer(s, { type: 'joinChallenge', payload: { definitionId: 'C06', now: NOW + 1 }, dateKey: TODAY });
    expect(again.challenges).toHaveLength(1);
    for (let i = 0; i < 100; i += 1) s = add(s, { key: 'blessing', category: 'other', now: NOW + i });
    const view = d(s).challenges[0]!;
    expect(view.reached).toBe(true);
    expect(view.state).toBe('active'); // not "completed" before the save is confirmed
    s = reducer(s, { type: 'completeChallenges', payload: { instanceIds: [view.enrollment.instanceId], now: NOW + 500 } });
    const done = reducer(s, { type: 'completeChallenges', payload: { instanceIds: [view.enrollment.instanceId], now: NOW + 900 } });
    expect(done).toBe(s);
    expect(d(s).challenges[0]!.state).toBe('completed');
    expect(d(s).todayPoints).toBe(230); // the challenge adds no points
  });

  it('a group challenge cannot be joined; C03 is offered only with a previous week', () => {
    const s = onboard(['learn-daily']);
    expect(reducer(s, { type: 'joinChallenge', payload: { definitionId: 'C12', now: NOW }, dateKey: TODAY })).toBe(s);
    expect(d(s).joinableChallenges.map((c) => c.id)).not.toContain('C03');
    const older = { ...onboard(['learn-daily']), memberSince: NOW - 10 * DAY };
    expect(d(older).joinableChallenges.map((c) => c.id)).toContain('C03');
  });

  it('leave → state left; expired after the window', () => {
    let s = onboard(['learn-daily']);
    s = reducer(s, { type: 'joinChallenge', payload: { definitionId: 'C04', now: NOW }, dateKey: TODAY });
    expect(d(s, '2026-11-30').challenges[0]!.state).toBe('expired');
    s = reducer(s, { type: 'leaveChallenge', payload: { instanceId: s.challenges[0]!.instanceId, now: NOW } });
    expect(d(s).challenges[0]!.state).toBe('left');
  });
});

describe('achievements', () => {
  it('first habit → "הצעד הראשון" is ready; granted once', () => {
    let s = onboard(['chesed']);
    expect(d(s).achievements.find((a) => a.def.id === 'A01')!.ready).toBe(false);
    s = add(s, { key: 'chesed' });
    const a01 = d(s).achievements.find((a) => a.def.id === 'A01')!;
    expect(a01.ready).toBe(true);
    const award = { achievementId: 'A01', version: 1, earnedAt: NOW, rulesVersion: 'score-3' };
    s = reducer(s, { type: 'grantAwards', payload: [award] });
    expect(reducer(s, { type: 'grantAwards', payload: [award] })).toBe(s);
    expect(d(s).achievements.find((a) => a.def.id === 'A01')!.earned).toEqual(award);
  });

  it('journey stages are neutral and based on goal days', () => {
    expect(journeyStage(0)).toMatchObject({ index: 1, name: 'יוצאים לדרך', next: { toGo: 7 } });
    expect(journeyStage(7).name).toBe('שבוע ראשון');
    expect(JSON.stringify(ACHIEVEMENTS.map((a) => a.title))).not.toMatch(/עובד ה|צדיק|בן תורה/);
  });
});

describe('practical content', () => {
  it('tests run in development: drafts load, labelled DRAFT, stable per day, linked to habits', async () => {
    const ideas = await loadPracticalIdeas();
    expect(ideas.length).toBe(52);
    expect(ideas.every((i) => i.status === 'DRAFT')).toBe(true);
    const a = ideaForDay(ideas, TODAY, ['gratitude']);
    expect(a?.habit).toBe('gratitude');
    expect(ideaForDay(ideas, TODAY, ['gratitude'])).toBe(a);
  });
});

describe('progress periods (B2)', async () => {
  const { periodStats } = await import('../lib/periods');
  it('a new user sees no comparison with days before joining; today is "open"', () => {
    let s = { ...onboard(['chesed']), memberSince: NOW };
    s = add(s, { key: 'torahStudy' });
    const st = periodStats(d(s).progressContext, 'week');
    expect(st.previous).toBeNull();
    expect(st.percent).toBeNull();
    expect(st.days.find((x) => x.key === '2026-11-22')!.state).toBe('before');
    expect(st.days.find((x) => x.key === TODAY)!.state).toBe('open');
    expect(st.byCategory.map((c) => c.category)).toEqual(['torah']);
  });
  it('compares with the previous week only when that week is after the start', () => {
    let s = { ...onboard(['chesed']), memberSince: NOW - 20 * DAY };
    s = add(s, { key: 'chesed', dateKey: '2026-11-17' });
    s = add(s, { key: 'chesed' });
    const st = periodStats(d(s).progressContext, 'week');
    expect(st.previous).toMatchObject({ goalDays: 1 });
    expect(st.goalDays).toBe(1);
  });
});
