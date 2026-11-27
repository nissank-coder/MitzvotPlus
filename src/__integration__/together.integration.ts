import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { accountApi, AccountApi } from '../backend/account';
import { togetherApi, TogetherApi } from '../backend/together';
import { createSqlSpaces, SqlStateStorage, userSpace } from '../storage/sqliteStorage';
import { SqlExecutor } from '../storage/migrations';
import { createFreshState, reducer } from '../store/state';
import { syncNow, SyncError, SyncRemote, SyncStatus } from '../sync/engine';
import { goalWireOf } from '../sync/goals';
import type { AppState } from '../types';
// @ts-expect-error – plain .mjs test server
import { prepareDatabase, startGateway } from '../../scripts/gateway/local-supabase.mjs';

/**
 * "לומדים יחד" – two people, end to end, with the app's REAL code: SQLite storage and outbox
 * (src/storage/sqliteStorage.ts on node:sqlite), the reducer, the sync engine, the account and
 * challenge calls (supabase-js). Two targets:
 *  - default (CI): the local stand-in (scripts/gateway) over a real PostgreSQL with every migration;
 *  - TOGETHER_TARGET=staging: the HOSTED Supabase project, with synthetic test accounts
 *    (STAGING_SUPABASE_URL, STAGING_PUBLISHABLE_KEY, STAGING_TESTERS=<json file outside the repo>).
 * What it does not prove: a phone (touch, the Android shell, its SQLite plugin) – that is the device
 * checklist. Every step is written to TOGETHER_EVIDENCE (no secret, ids shortened).
 */
const STAGING = process.env.TOGETHER_TARGET === 'staging';
const ADMIN = process.env.DATABASE_URL ?? 'postgres://postgres@localhost:54329/postgres?host=/tmp';
type Tester = { email: string; password: string };
let target: { url: string; key: string; gw?: Awaited<ReturnType<typeof startGateway>>; testers?: Record<'a' | 'b' | 'c', Tester> };
const log: Array<{ at: string; step: string; ok: boolean; detail?: unknown }> = [];
const step = (name: string, ok: boolean, detail?: unknown) => {
  log.push({ at: new Date().toISOString(), step: name, ok, ...(detail === undefined ? {} : { detail }) });
  return ok;
};
const tz = 'Asia/Jerusalem';
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());

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

/** A phone: its own SQLite (kept across a "restart"), its own session, the app's engine. */
class Phone {
  readonly db: SqlExecutor;
  spaces: ReturnType<typeof createSqlSpaces>;
  constructor(db: SqlExecutor = sqlite()) {
    this.db = db;
    this.spaces = createSqlSpaces(db);
  }
  sb!: SupabaseClient;
  api!: AccountApi;
  together!: TogetherApi;
  state: AppState = createFreshState(Date.now());
  storage!: SqlStateStorage;
  userId = '';
  failNextSubmit = false;
  /** How far ahead the sync clock runs (a retry after the backoff = a later sync). */
  clockAhead = 1000;
  private connect() {
    this.sb = createClient(target.url, target.key, { auth: { storage: memoryAuthStorage(), persistSession: true, autoRefreshToken: false, detectSessionInUrl: false, flowType: 'pkce' } });
    this.api = accountApi(this.sb);
    this.together = togetherApi(this.sb);
  }
  async signIn(who: 'a' | 'b' | 'c') {
    this.connect();
    let u;
    if (STAGING) {
      const t = target.testers![who];
      u = await this.api.signInWithPassword(t.email, t.password);
    } else {
      const email = `together-${who}@test.invalid`;
      await this.api.requestCode(email);
      u = await this.api.verifyCode(email, target.gw!.mailbox(email)!);
    }
    this.userId = u.id;
    await this.spaces.setActive(userSpace(u.id));
    this.storage = (await this.spaces.open(userSpace(u.id))) as SqlStateStorage;
    const raw = await this.storage.load();
    this.state = raw ? JSON.parse(raw) : createFreshState(Date.now());
    return u;
  }
  async signOut() {
    await this.api.signOut();
    this.userId = '';
  }
  async learn(key = 'torahStudy') {
    this.state = reducer(this.state, { type: 'addAction', payload: { key, now: Date.now(), dateKey: today() } as never });
    await this.storage.save(this.state);
    return this.state.logs[0]!;
  }
  async undo(id: string) {
    this.state = reducer(this.state, { type: 'removeLog', payload: { id } });
    await this.storage.save(this.state);
  }
  async sync(): Promise<SyncStatus> {
    const consent = await this.api.consent();
    const remote = this.api.remote();
    const wrapped: SyncRemote = {
      ...remote,
      submit: async (batch, epoch) => {
        if (this.failNextSubmit) {
          this.failNextSubmit = false;
          throw new SyncError('offline', 'Failed to fetch (simulated: the connection dropped)');
        }
        return remote.submit(batch, epoch);
      },
    };
    return syncNow({
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
      backup: {
        local: () => ({ epoch: this.state.sync?.backupEpoch ?? 1, floor: this.state.sync?.backupFloor ?? null }),
        rebuild: async (next) => {
          await this.storage.rebuildOutbox(next.floor);
          this.state = reducer(this.state, { type: 'backupGenerationApplied', payload: next });
          await this.storage.save(this.state);
        },
      },
      remote: wrapped,
      gate: { enabled: true, consent: { cloudBackup: consent.cloudBackup } },
      now: () => Date.now() + this.clockAhead,
    });
  }
  async optIn(name: string) {
    await this.together.setDisplayName(name);
    const before = await this.api.consent();
    await this.api.setConsent({ cloudBackup: true, social: true });
    if (!before.cloudBackup) await this.together.backupFromNow();
  }
}

beforeAll(async () => {
  if (STAGING) {
    const url = process.env.STAGING_SUPABASE_URL ?? '';
    const key = process.env.STAGING_PUBLISHABLE_KEY ?? '';
    if (!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(url) || !key || /^sb_secret_/.test(key)) throw new Error('staging needs its URL and PUBLISHABLE key');
    target = { url, key, testers: JSON.parse(fs.readFileSync(process.env.STAGING_TESTERS ?? '', 'utf8')) };
  } else {
    const db = await prepareDatabase(ADMIN, 'mitzvot_together');
    const gw = await startGateway({ databaseUrl: db, accessTtlSeconds: 300, otpResendSeconds: 1 });
    target = { url: gw.url, key: gw.anonKey, gw };
  }
});
afterAll(async () => {
  await target?.gw?.close();
  if (process.env.TOGETHER_EVIDENCE) {
    fs.writeFileSync(process.env.TOGETHER_EVIDENCE, JSON.stringify({ target: STAGING ? `hosted Supabase (${new URL(target.url).hostname.split('.')[0]})` : 'local stand-in over PostgreSQL', at: new Date().toISOString(), steps: log }, null, 2));
  }
});

describe(`learning together – two people (${STAGING ? 'HOSTED Supabase staging' : 'local stand-in'})`, () => {
  const A = new Phone();
  const B = new Phone();
  const C = new Phone();
  let challengeId = '';
  const progressOf = async (p: Phone, who: Phone) => {
    const pr = await p.together.progress(challengeId);
    return pr.state === 'unavailable' ? undefined : pr.members.find((m) => m.userId === who.userId);
  };

  it('1–2. three separate accounts sign in; A and B agree to share (display name, backup from now)', async () => {
    const [ua, ub, uc] = [await A.signIn('a'), await B.signIn('b'), await C.signIn('c')];
    expect(step('three accounts, three ids', new Set([ua.id, ub.id, uc.id]).size === 3)).toBe(true);
    await A.optIn('אבי (בדיקה)');
    await B.optIn('בתיה (בדיקה)');
    await C.optIn('גד (בדיקה)');
    expect(step('consent on both sides', (await A.api.consent()).social && (await B.api.consent()).cloudBackup)).toBe(true);
  });

  it('3–4. A invites; B sees who and the terms, and joins on purpose; C, not invited, gets nothing', async () => {
    const inv = await A.together.createInvite(tz);
    challengeId = inv.challengeId;
    step('A created an invitation', /^[A-HJ-NP-Z2-9]{8}$/.test(inv.code));
    const pv = await B.together.preview(inv.code);
    expect(step('B sees the inviter and the terms before joining', pv.state === 'ok' && pv.target === 3 && pv.days === 7, pv)).toBe(true);
    expect((await B.together.join(inv.code, false)).state).toBe('terms_required');
    const jn = await B.together.join(inv.code, true);
    expect(step('B joined', jn.state === 'joined')).toBe(true);
    expect(step('C cannot use the used code', (await C.together.join(inv.code, true)).state === 'invalid')).toBe(true);
    expect(step('C cannot see the challenge', (await C.together.progress(challengeId)).state === 'unavailable')).toBe(true);
  });

  it('5–7. A records learning on the "phone" (SQLite), it is sent, and B sees it – no demo data', async () => {
    expect(step('before: A has 0 learning days for B', (await progressOf(B, A))?.days === 0)).toBe(true);
    const e = await A.learn('torahStudy');
    const outbox = await A.storage.listOutbox();
    expect(step('the entry is in the SQLite outbox before sending', outbox.some((o) => o.eventId === e.id && o.status === 'pending'))).toBe(true);
    const s = await A.sync();
    expect(step('A sync', s.state === 'ok', s)).toBe(true);
    expect(step('B sees A at 1 learning day (server-confirmed)', (await progressOf(B, A))?.days === 1)).toBe(true);
  });

  it('8. undo: A removes the entry → B sees 0 again', async () => {
    const id = A.state.logs.find((l) => l.actionKey === 'torahStudy')!.id;
    await A.undo(id);
    await A.sync();
    expect(step('after undo, B sees A at 0', (await progressOf(B, A))?.days === 0)).toBe(true);
  });

  it('9. the connection drops while sending: the entry stays on the device; the retry counts it once', async () => {
    const e = await A.learn('learningTrack');
    A.failNextSubmit = true;
    const s1 = await A.sync();
    expect(step('first send fails (no connection)', s1.state === 'error', s1)).toBe(true);
    expect(step('the entry is still in the outbox', (await A.storage.listOutbox()).some((o) => o.eventId === e.id && o.status !== 'accepted'))).toBe(true);
    A.clockAhead = 3_600_000; // the next attempt comes after the backoff
    const s2 = await A.sync();
    A.clockAhead = 1000;
    const item = (await A.storage.listOutbox()).find((o) => o.eventId === e.id);
    expect(step('the retry sends it, and it is accepted', s2.state === 'ok' && item?.status === 'accepted', { s2, item: item?.status })).toBe(true);
    expect(step('B sees A at 1 day after the retry', (await progressOf(B, A))?.days === 1)).toBe(true);
    await A.learn('mitzvahStudy'); // a second learning entry the same day
    await A.sync();
    const again = await A.api.remote().submit([{ eventId: e.id, operation: 'create', payload: (await A.storage.listOutbox()).find((o) => o.eventId === e.id)!.payload } as never], undefined);
    expect(step('sending the same entry again is a duplicate, not a second entry', again[0]?.outcome === 'duplicate', again)).toBe(true);
    expect(step('B sees A at exactly 1 day (two entries, one day; no double count)', (await progressOf(B, A))?.days === 1)).toBe(true);
  });

  it('7. cheers: B cheers A; a retry of the same tap is not a second cheer', async () => {
    const req = crypto.randomUUID();
    expect(step('B cheers A', (await B.together.cheer(challengeId, A.userId, req)) === 'ok')).toBe(true);
    expect(step('the same request again: duplicate', (await B.together.cheer(challengeId, A.userId, req)) === 'duplicate')).toBe(true);
    expect(step('A sees one cheer', (await progressOf(A, A))?.cheersReceived === 1)).toBe(true);
  });

  it('10. privacy: a private action never leaves the device; sharing off and a block are enforced for the other account', async () => {
    await A.learn('visitSick');
    await A.sync();
    const { data } = await A.sb.from('activity_events').select('action_type');
    expect(step('no private action on the server', !(data ?? []).some((r: { action_type: string }) => r.action_type === 'visitSick'), data?.map((r: { action_type: string }) => r.action_type))).toBe(true);
    await A.api.setConsent({ cloudBackup: true, social: false });
    expect(step('A stops sharing → B no longer sees A', (await progressOf(B, A))?.visibility === 'hidden')).toBe(true);
    await A.api.setConsent({ cloudBackup: true, social: true });
    await B.together.block(A.userId);
    expect(step('B blocks A → A no longer sees B', (await progressOf(A, B))?.visibility === 'hidden')).toBe(true);
    expect(step('…and A cannot cheer B', (await A.together.cheer(challengeId, B.userId, crypto.randomUUID())) === 'unavailable')).toBe(true);
    await B.sb.from('blocks').delete().eq('blocked', A.userId);
    expect(step('after unblocking, the agreed progress shows again', (await progressOf(A, B))?.visibility === 'visible')).toBe(true);
  });

  it('11. switching accounts on one phone: A out, C in – no data or late answer moves between them', async () => {
    const shared = new Phone(A.db); // the same device
    await shared.signIn('a');
    const aLogs = shared.state.logs.length;
    await shared.signOut();
    await shared.signIn('c');
    expect(step("C's space on the same device has none of A's entries", shared.state.logs.length === 0 && aLogs > 0, { aLogs })).toBe(true);
    expect(step('C still cannot see the challenge', (await shared.together.progress(challengeId)).state === 'unavailable')).toBe(true);
  });

  it('12. a restart keeps everything; leaving is shown to the other side', async () => {
    const again = new Phone(A.db);
    await again.signIn('a');
    const box = await again.storage.listOutbox();
    expect(step('after a restart A has the same entries and nothing left to send', again.state.logs.length === A.state.logs.length && box.every((o) => o.status !== 'pending'), { logs: [again.state.logs.length, A.state.logs.length], outbox: box.map((o) => `${o.operation}:${o.status}`) })).toBe(true);
    await B.together.leave(challengeId);
    expect(step('B left → A sees "left"', (await progressOf(A, B))?.visibility === 'left')).toBe(true);
  });
});
