import { DatabaseSync } from 'node:sqlite';
import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { accountApi, AccountApi } from '../backend/account';
import { createSqlSpaces, SqlStateStorage, userSpace } from '../storage/sqliteStorage';
import { SqlExecutor } from '../storage/migrations';
import { createFreshState, reducer } from '../store/state';
import { scoreLogs } from '../lib/metrics';
import { syncNow, SyncStatus } from '../sync/engine';
import type { AppState } from '../types';
// @ts-expect-error – plain .mjs test server
import { prepareDatabase, startGateway } from '../../scripts/gateway/local-supabase.mjs';

/**
 * Round 12.5 – the app's REAL account and sync code (supabase-js 2.119.2, src/backend/account.ts,
 * src/sync/engine.ts, the SQLite storage) end to end against a REAL PostgreSQL with the real
 * migrations, through a local stand-in for Supabase Auth + REST (scripts/gateway). Synthetic test
 * accounts only (@test.invalid). What this does not prove: hosted Supabase itself, e-mail delivery,
 * a native build on a phone.
 */
type Gateway = Awaited<ReturnType<typeof startGateway>> & { url: string; anonKey: string };
let gw: Gateway;
const ADMIN = process.env.DATABASE_URL ?? 'postgres://postgres@localhost:54329/postgres?host=/tmp';

function sqlite(): SqlExecutor {
  const db = new DatabaseSync(':memory:');
  return {
    execute: async (sql) => void db.exec(sql),
    query: async <T,>(sql: string, values: unknown[] = []) => db.prepare(sql).all(...(values as never[])) as T[],
    transaction: async (statements) => {
      db.exec('BEGIN');
      try {
        for (const s of statements) db.prepare(s.sql).run(...((s.values ?? []) as never[]));
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
  };
}

const memoryAuthStorage = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};
const client = () => createClient(gw.url, gw.anonKey, { auth: { storage: memoryAuthStorage(), persistSession: true, autoRefreshToken: false, detectSessionInUrl: false } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A phone: its own SQLite, its own Supabase session, the app's engine. */
class Phone {
  spaces = createSqlSpaces(sqlite());
  private session?: AccountApi;
  get api(): AccountApi {
    return (this.session ??= accountApi(client())); // created when first used (after beforeAll)
  }
  state: AppState = createFreshState(Date.now());
  storage!: SqlStateStorage;
  userId = '';
  lastConsent = { cloudBackup: false, social: false };
  async signIn(email: string) {
    await this.api.requestCode(email);
    const u = await this.api.verifyCode(email, gw.mailbox(email)!);
    this.userId = u.id;
    this.storage = (await this.spaces.open(userSpace(u.id))) as SqlStateStorage;
    const raw = await this.storage.load();
    if (raw) this.state = JSON.parse(raw);
    return u;
  }
  async act(key: string, extra: Record<string, unknown> = {}) {
    this.state = reducer(this.state, { type: 'addAction', payload: { key, now: Date.now(), ...extra } as never });
    await this.storage.save(this.state);
    return this.state.logs[0]!;
  }
  async remove(id: string) {
    this.state = reducer(this.state, { type: 'removeLog', payload: { id } });
    await this.storage.save(this.state);
  }
  async sync(): Promise<SyncStatus> {
    // Like the app: the last consent the server confirmed is kept; a failed read does not change it.
    const consent = await this.api.consent().then((c) => (this.lastConsent = c), () => this.lastConsent);
    let hash = this.state.sync?.goalsHash ?? null;
    const s = await syncNow({
      listOutbox: () => this.storage.listOutbox(),
      saveOutbox: (i) => this.storage.saveOutbox(i),
      installationId: () => this.storage.installationId(),
      logs: () => this.state.logs,
      cursor: () => this.state.sync?.cursor ?? 0,
      applyRemote: (events) => {
        this.state = reducer(this.state, { type: 'applyRemoteEvents', payload: events });
      },
      persist: async () => {
        await this.storage.save(this.state);
        return true;
      },
      goals: { current: () => this.state.goalHistory.map((g) => ({ from: g.from, blessingGoal: g.blessingGoal })), sent: () => hash, markSent: (h) => void (hash = h) },
      remote: this.api.remote(),
      gate: { enabled: true, consent: { cloudBackup: consent.cloudBackup } },
      now: () => Date.now() + 1000,
    });
    if (hash) this.state = reducer(this.state, { type: 'syncGoalsSent', payload: { hash } });
    return s;
  }
}

beforeAll(async () => {
  const db = await prepareDatabase(ADMIN, 'mitzvot_integration');
  // Access tokens shorter than supabase-js' refresh margin (90 s): every request refreshes the session.
  gw = await startGateway({ databaseUrl: db, accessTtlSeconds: 60, otpResendSeconds: 1 });
});
afterAll(async () => {
  await gw?.close();
});

describe('staging rehearsal: sign-in with an e-mail code (real supabase-js)', () => {
  it('a wrong code, an expired code and asking again too soon are refused; the right code signs in', async () => {
    const api = accountApi(client());
    const email = 'otp-check@test.invalid';
    await api.requestCode(email);
    await expect(api.verifyCode(email, '000000' === gw.mailbox(email) ? '111111' : '000000')).rejects.toThrow('code_invalid_or_expired');
    await expect(api.requestCode(email)).rejects.toThrow('code_rate_limited');
    gw.expireOtp(email);
    await expect(api.verifyCode(email, gw.mailbox(email)!)).rejects.toThrow('code_invalid_or_expired');
    await sleep(1100);
    await api.requestCode(email);
    const u = await api.verifyCode(email, gw.mailbox(email)!);
    expect(u.email).toBe(email);
    expect(await api.currentUser()).toMatchObject({ id: u.id });
    // A code is used once.
    await expect(api.verifyCode(email, gw.mailbox(email)!)).rejects.toThrow('code_invalid_or_expired');
  });

  it('the session refreshes itself (short-lived access tokens) and the private profile starts with consent off', async () => {
    const phone = new Phone();
    await phone.signIn('refresh@test.invalid');
    const before = gw.stats.refreshes;
    expect(await phone.api.consent()).toEqual({ cloudBackup: false, social: false });
    expect(await phone.api.consent()).toEqual({ cloudBackup: false, social: false });
    expect(gw.stats.refreshes).toBeGreaterThan(before);
  });
});

describe('staging rehearsal: two phones, one account', () => {
  const email = 'two-phones@test.invalid';
  const one = new Phone();
  const two = new Phone();

  it('nothing is sent before consent; private actions never leave the phone', async () => {
    await one.signIn(email);
    await one.act('shacharit', { minyan: true });
    await one.act('chesed');
    await one.act('charity'); // local only
    for (let i = 0; i < 3; i += 1) await one.act('blessing', { category: 'other' });
    expect(await one.sync()).toEqual({ state: 'consent-needed' });
    expect((await gw.query('select count(*)::int n from public.activity_events where user_id = $1', [one.userId]))[0].n).toBe(0);
    await one.api.setConsent({ cloudBackup: true, social: false });
    const s = await one.sync();
    expect(s).toMatchObject({ state: 'ok', pushed: 5, rejected: 0 });
    const actions = (await gw.query('select action_type from public.activity_events where user_id = $1', [one.userId])).map((r: { action_type: string }) => r.action_type);
    expect(actions.sort()).toEqual(['blessing', 'blessing', 'blessing', 'chesed', 'shacharit']);
  });

  it('the second phone receives the entries, the server score equals the engine of both phones', async () => {
    await sleep(1100);
    await two.signIn(email);
    expect(two.userId).toBe(one.userId);
    expect(await two.sync()).toMatchObject({ state: 'ok', pulled: 5 });
    expect(two.state.logs).toHaveLength(5);
    const day = one.state.logs[0]!.dateKey;
    const server = (await gw.query('select points from public.daily_scores where user_id = $1 and local_date = $2', [one.userId, day]))[0]?.points;
    const onePublic = one.state.logs.filter((l) => l.actionKey !== 'charity');
    expect(server).toBe(scoreLogs(onePublic, one.state.goalHistory).byDay.get(day));
    expect(scoreLogs(two.state.logs, two.state.goalHistory).byDay.get(day)).toBe(server);
  });

  it('a deletion on phone 2 reaches phone 1; deleting it on both phones counts once; nothing is scored twice', async () => {
    const target = two.state.logs.find((l) => l.actionKey === 'chesed')!;
    await two.remove(target.id);
    expect(await two.sync()).toMatchObject({ state: 'ok', pushed: 1 });
    await one.remove(target.id); // the same entry, deleted on phone 1 before it heard of it
    expect(await one.sync()).toMatchObject({ state: 'ok' });
    expect(one.state.logs.some((l) => l.id === target.id)).toBe(false);
    expect((await gw.query("select count(*)::int n from public.activity_events where user_id = $1 and operation = 'void'", [one.userId]))[0].n).toBe(1);
    const day = target.dateKey;
    const server = (await gw.query('select points from public.daily_scores where user_id = $1 and local_date = $2', [one.userId, day]))[0]?.points;
    expect(scoreLogs(two.state.logs, two.state.goalHistory).byDay.get(day)).toBe(server);
  });

  it('a lost connection is an error with the entry kept; the next run sends it once', async () => {
    await one.act('mincha');
    gw.setOffline(true);
    const s = await one.sync();
    gw.setOffline(false);
    expect(s.state).toBe('error');
    expect((await one.storage.listOutbox()).filter((o) => o.status === 'pending' || o.status === 'deferred')).toHaveLength(1);
    // Backoff: make the item due now, as a later run would.
    await one.storage.saveOutbox((await one.storage.listOutbox()).map((o) => (o.status === 'pending' ? { ...o, nextAttemptAt: 0 } : o)));
    expect(await one.sync()).toMatchObject({ state: 'ok', pushed: 1 });
    expect((await gw.query("select count(*)::int n from public.activity_events where user_id = $1 and action_type = 'mincha'", [one.userId]))[0].n).toBe(1);
  });

  it('a goal change is sent before the events and old days keep their own goal', async () => {
    one.state = reducer(one.state, { type: 'updateGoals', payload: { blessingGoal: 20 }, dateKey: '2099-01-01' });
    await one.storage.save(one.state);
    await one.sync();
    const rows = await gw.query('select g.from_date::text as from_text, g.blessing_goal from public.blessing_goal_history g where g.user_id = $1 order by g.from_date', [one.userId]);
    expect(rows.map((r: { blessing_goal: number }) => r.blessing_goal)).toEqual([100, 20]);
  });

  it('an event with an unexpected private field is refused through the real API, even for a backed-up action', async () => {
    const sb = client();
    const api = accountApi(sb);
    await sleep(1100);
    await api.requestCode(email);
    await api.verifyCode(email, gw.mailbox(email)!);
    const log = reducer(createFreshState(Date.now()), { type: 'addAction', payload: { key: 'chesed', now: Date.now() } as never }).logs[0]!;
    const payload = { eventId: log.id, installationId: 'inst-test-0001', schemaVersion: 2, operation: 'create', actionType: 'chesed', quantity: 1, occurredAtUtc: new Date(log.createdAt).toISOString(), recordedAtUtc: new Date(log.createdAt).toISOString(), localDate: log.dateKey, rulesVersion: 'score-3', note: 'עזרתי ל… (פרטי)' };
    const receipts = await api.remote().submit([{ eventId: log.id, operation: 'create', payload: JSON.stringify(payload) }]);
    expect(receipts[0]).toMatchObject({ outcome: 'rejected', reasonCode: 'unexpected_field' });
  });

  it('revoking consent with deletion empties the cloud copy and stops uploads', async () => {
    await one.api.setConsent({ cloudBackup: false, social: false }, true);
    expect((await gw.query('select count(*)::int n from public.activity_events where user_id = $1', [one.userId]))[0].n).toBe(0);
    await one.act('arvit');
    expect(await one.sync()).toEqual({ state: 'consent-needed' });
    expect((await gw.query('select count(*)::int n from public.activity_events where user_id = $1', [one.userId]))[0].n).toBe(0);
  });

  it('account deleted on phone 1: phone 2 learns it on its next sync, and its old session cannot bring anything back', async () => {
    await one.api.setConsent({ cloudBackup: true, social: false });
    await one.api.deleteAccount();
    expect(await one.api.currentUser()).toBeNull();
    expect(await two.sync()).toEqual({ state: 'account-deleted' });
    expect((await gw.query('select count(*)::int n from auth.users where id = $1', [two.userId]))[0].n).toBe(0);
    expect((await gw.query('select count(*)::int n from public.activity_events where user_id = $1', [two.userId]))[0].n).toBe(0);
    // The phone's own data is untouched (the app then asks: delete it, or move it to the guest).
    expect(two.state.logs.length).toBeGreaterThan(0);
  });
});

describe('staging rehearsal: sign-out', () => {
  it('sign-out revokes the session on the server; the old refresh token no longer works', async () => {
    const phone = new Phone();
    await phone.signIn('signout@test.invalid');
    expect(await phone.api.signOut()).toEqual({ serverRevoked: true });
    expect(await phone.api.currentUser()).toBeNull();
    await expect(phone.api.consent()).rejects.toThrow();
  });

  it('sign-out without a connection still removes the session from the phone, and says so', async () => {
    const phone = new Phone();
    await phone.signIn('signout-offline@test.invalid');
    gw.setOffline(true);
    const r = await phone.api.signOut();
    gw.setOffline(false);
    expect(r).toEqual({ serverRevoked: false });
    expect(await phone.api.currentUser()).toBeNull();
  });

  it('two accounts on one phone: the second account sees nothing of the first', async () => {
    const phone = new Phone();
    await phone.signIn('first@test.invalid');
    await phone.api.setConsent({ cloudBackup: true, social: false });
    await phone.act('shacharit');
    await phone.sync();
    await phone.api.signOut();
    const second = new Phone();
    second.spaces = phone.spaces; // same device database
    await second.signIn('second@test.invalid');
    await second.api.setConsent({ cloudBackup: true, social: false });
    expect(second.state.logs).toHaveLength(0);
    expect(await second.sync()).toMatchObject({ state: 'ok', pulled: 0 });
    expect(await phone.spaces.count(userSpace(phone.userId))).toBe(1);
  });
});
