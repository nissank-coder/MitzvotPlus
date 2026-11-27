import { describe, expect, it } from 'vitest';
import { createFreshState, reducer } from '../store/state';
import { SyncDeps, SyncError, syncNow, SyncRemote } from '../sync/engine';
import { goalsFingerprint, goalWireOf, GoalWire, mergeGoalWires, planGoals, withBlessingGoals } from '../sync/goals';
import type { AppState } from '../types';

/**
 * Round 13 (review B2) – blessing-goal history between devices. Before: every sync replaced the
 * server's history with the device's own, so phone B, still holding "100", undid phone A's "50".
 * Now: a version on the server, adopt / push / merge, and a defined conflict rule.
 */
const DAY = '2026-11-24';
const at = (s: string) => Date.parse(`${s}T10:00:00Z`);

/** The versioned server of 20261128000001_backup_generation.sql, in memory. */
class GoalServer {
  version = 0;
  goals: GoalWire[] = [];
  writes = 0;
  remote(): SyncRemote {
    return {
      submit: async () => [],
      pull: async () => [],
      getBlessingGoals: async () => ({ version: this.version, goals: this.goals }),
      setBlessingGoals: async (goals, baseVersion) => {
        if (baseVersion !== this.version) throw new SyncError('goals_conflict');
        this.writes += 1;
        this.goals = goals;
        return (this.version += 1);
      },
    };
  }
}

class Phone {
  state: AppState;
  constructor(public server: GoalServer) {
    this.state = reducer(createFreshState(at(DAY)), {
      type: 'completeOnboarding',
      payload: { userName: 'בודק', dailyGoal: 5, profile: { gender: 'male' }, dateKey: '2026-11-01', habits: [{ id: 'learn-daily', perWeek: 7 }] },
    });
  }
  setGoal(blessingGoal: number, dateKey: string) {
    this.state = reducer(this.state, { type: 'updateGoals', payload: { blessingGoal }, dateKey });
  }
  deps(remote = this.server.remote()): SyncDeps {
    return {
      listOutbox: async () => [],
      saveOutbox: async () => undefined,
      installationId: async () => 'inst-test',
      logs: () => this.state.logs,
      cursor: () => 0,
      applyRemote: () => undefined,
      goals: {
        wire: () => goalWireOf(this.state.goalHistory),
        known: () => ({ fingerprint: this.state.sync?.goalsHash ?? null, version: this.state.sync?.goalsVersion ?? 0 }),
        adopt: (wire) => {
          this.state = reducer(this.state, { type: 'goalsAdopted', payload: { wire } });
        },
        markSynced: (fingerprint, version) => {
          this.state = reducer(this.state, { type: 'goalsSynced', payload: { fingerprint, version } });
        },
      },
      remote,
      gate: { enabled: true, consent: { cloudBackup: true } },
      now: () => Date.now(),
    };
  }
  sync(remote?: SyncRemote) {
    return syncNow(this.deps(remote));
  }
  goals() {
    return goalWireOf(this.state.goalHistory).map((g) => `${g.from}:${g.blessingGoal}`);
  }
}

describe('B2 – blessing goals on two phones', () => {
  it('phone A sets 50; phone B, still on 100 and unchanged, takes the change instead of undoing it', async () => {
    const server = new GoalServer();
    const a = new Phone(server);
    const b = new Phone(server);
    await a.sync();
    await b.sync();
    a.setGoal(50, DAY);
    await a.sync();
    expect(server.goals.map((g) => `${g.from}:${g.blessingGoal}`)).toEqual(['0000-00-00:100', `${DAY}:50`]);
    await b.sync();
    expect(server.goals.map((g) => `${g.from}:${g.blessingGoal}`)).toEqual(['0000-00-00:100', `${DAY}:50`]);
    expect(b.goals()).toEqual(['0000-00-00:100', `${DAY}:50`]);
    expect(b.state.blessingGoal).toBe(50);
    // B's own goals other than blessings (daily goal, habits) are untouched.
    expect(b.state.goalHistory.at(-1)?.habits).toEqual([{ id: 'learn-daily', perWeek: 7 }]);
  });

  it('the requests arrive in the other order (B first, A second): the result is the same', async () => {
    for (const order of ['a-first', 'b-first'] as const) {
      const server = new GoalServer();
      const a = new Phone(server);
      const b = new Phone(server);
      await a.sync();
      await b.sync();
      a.setGoal(50, '2026-11-20');
      b.setGoal(120, '2026-11-25');
      const [first, second] = order === 'a-first' ? [a, b] : [b, a];
      await first.sync();
      await second.sync(); // conflict → merge
      await first.sync(); // takes the merge
      const expected = ['0000-00-00:100', '2026-11-20:50', '2026-11-25:120'];
      expect(server.goals.map((g) => `${g.from}:${g.blessingGoal}`)).toEqual(expected);
      expect(a.goals()).toEqual(expected);
      expect(b.goals()).toEqual(expected);
    }
  });

  it('a write that loses the race (another phone wrote in between) is read, merged and written again', async () => {
    const server = new GoalServer();
    const a = new Phone(server);
    await a.sync();
    a.setGoal(60, DAY);
    const base = server.remote();
    let raced = false;
    const remote: SyncRemote = {
      ...base,
      setBlessingGoals: async (goals, v) => {
        if (!raced) {
          raced = true;
          await base.setBlessingGoals!([{ from: '0000-00-00', blessingGoal: 100, setAt: 0 }, { from: '2026-11-10', blessingGoal: 80, setAt: 1 }], v);
        }
        return base.setBlessingGoals!(goals, v);
      },
    };
    expect(await a.sync(remote)).toMatchObject({ state: 'ok' });
    expect(server.goals.map((g) => `${g.from}:${g.blessingGoal}`)).toEqual(['0000-00-00:100', '2026-11-10:80', `${DAY}:60`]);
  });

  it('an empty server history (new account, or the cloud copy was deleted) is never adopted: the phone writes its own', async () => {
    const server = new GoalServer();
    const a = new Phone(server);
    a.setGoal(70, DAY);
    server.version = 4; // e.g. after a deletion
    await a.sync();
    expect(a.goals()).toEqual(['0000-00-00:100', `${DAY}:70`]);
    expect(server.goals.map((g) => `${g.from}:${g.blessingGoal}`)).toEqual(['0000-00-00:100', `${DAY}:70`]);
  });

  it('nothing changed anywhere: no write', async () => {
    const server = new GoalServer();
    const a = new Phone(server);
    await a.sync();
    const writes = server.writes;
    await a.sync();
    await a.sync();
    expect(server.writes).toBe(writes);
  });
});

describe('B2 – the conflict rule', () => {
  it('union by start day; the same start day → the goal set later wins; a tie keeps the server\'s', () => {
    const server: GoalWire[] = [{ from: '0000-00-00', blessingGoal: 100, setAt: 0 }, { from: '2026-11-20', blessingGoal: 50, setAt: 10 }];
    const local: GoalWire[] = [{ from: '0000-00-00', blessingGoal: 100, setAt: 0 }, { from: '2026-11-20', blessingGoal: 80, setAt: 20 }, { from: '2026-11-25', blessingGoal: 90, setAt: 5 }];
    expect(mergeGoalWires(local, server).map((g) => `${g.from}:${g.blessingGoal}`)).toEqual(['0000-00-00:100', '2026-11-20:80', '2026-11-25:90']);
    const tie = [{ ...local[1]!, setAt: 10 }];
    expect(mergeGoalWires(tie, server).find((g) => g.from === '2026-11-20')?.blessingGoal).toBe(50);
  });

  it('a habits-only change is not a goal change: it does not override a goal set on another phone the same day', () => {
    let s = reducer(createFreshState(at(DAY)), { type: 'completeOnboarding', payload: { userName: 'x', dailyGoal: 5, profile: { gender: 'male' }, dateKey: '2026-11-01', habits: [{ id: 'learn-daily', perWeek: 7 }] } });
    s = reducer(s, { type: 'setHabits', payload: { habits: [{ id: 'learn-daily', perWeek: 7 }, { id: 'tehillim', perWeek: 7 }] }, dateKey: DAY });
    const wire = goalWireOf(s.goalHistory);
    expect(wire).toEqual([{ from: '0000-00-00', blessingGoal: 100, setAt: 0 }]);
    const other: GoalWire[] = [{ from: '0000-00-00', blessingGoal: 100, setAt: 0 }, { from: DAY, blessingGoal: 50, setAt: Date.now() }];
    expect(mergeGoalWires(wire, other).map((g) => g.blessingGoal)).toEqual([100, 50]);
  });

  it('the time of a goal change is kept with the snapshot; the history of daily goals and habits stays the phone\'s own', () => {
    let s = reducer(createFreshState(at(DAY)), { type: 'completeOnboarding', payload: { userName: 'x', dailyGoal: 5, profile: { gender: 'male' }, dateKey: '2026-11-01', habits: [{ id: 'learn-daily', perWeek: 7 }] } });
    const before = Date.now();
    s = reducer(s, { type: 'updateGoals', payload: { blessingGoal: 60 }, dateKey: DAY });
    expect(s.goalHistory.at(-1)?.blessingSetAt).toBeGreaterThanOrEqual(before);
    const merged = withBlessingGoals(s.goalHistory, [{ from: '0000-00-00', blessingGoal: 100, setAt: 0 }, { from: '2026-11-10', blessingGoal: 80, setAt: 1 }, { from: DAY, blessingGoal: 60, setAt: 2 }]);
    expect(merged.map((g) => `${g.from}:${g.blessingGoal}:${g.dailyGoal}`)).toEqual(['0000-00-00:100:5', '2026-11-10:80:5', `${DAY}:60:5`]);
    expect(merged.every((g) => g.habits?.[0]?.id === 'learn-daily')).toBe(true);
  });

  it('plan: only the server changed → adopt; only here → push; both → merge; identical → nothing', () => {
    const base: GoalWire[] = [{ from: '0000-00-00', blessingGoal: 100, setAt: 0 }];
    const changed: GoalWire[] = [...base, { from: DAY, blessingGoal: 50, setAt: 1 }];
    const fp = goalsFingerprint(base);
    expect(planGoals(base, fp, 1, { version: 2, goals: changed }).kind).toBe('adopt');
    expect(planGoals(changed, fp, 1, { version: 1, goals: base }).kind).toBe('push');
    expect(planGoals([...base, { from: '2026-11-30', blessingGoal: 90, setAt: 3 }], fp, 1, { version: 2, goals: changed }).kind).toBe('merge');
    expect(planGoals(changed, fp, 1, { version: 2, goals: changed }).kind).toBe('nothing');
  });
});
