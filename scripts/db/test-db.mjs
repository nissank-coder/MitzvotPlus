// Database tests (round 12): applies supabase/migrations to a real PostgreSQL and proves the
// row-level security, the server functions and the server-side scoring.
// Every check is an assertion; any failure exits 1.
//   DATABASE_URL=postgres://postgres@localhost:5432/postgres node scripts/db/test-db.mjs
// Default: local socket /tmp, port 54329 (see docs/mobile-readiness/round-12/STATUS_HE.md).
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const require = createRequire(import.meta.url);
const ADMIN_URL = process.env.DATABASE_URL ?? 'postgres://postgres@localhost:54329/postgres?host=/tmp';
const DB = 'mitzvot_test';

const failures = [];
const passed = [];
const check = (cond, name, detail = '') => (cond ? passed.push(name) : failures.push(`${name}${detail ? ` – ${detail}` : ''}`));

// --- app code (TypeScript) for parity: the same events and the same scoring as the client
const ts = require('typescript');
const fs = require('node:fs');
require.extensions['.ts'] = (m, f) =>
  m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), { compilerOptions: { module: 1, target: 9, esModuleInterop: true } }).outputText, f);
const { createFreshState, reducer } = require('../../src/store/state.ts');
const { createEventPayload } = require('../../src/sync/outbox.ts');
const { scoreLogs } = require('../../src/lib/metrics.ts');

// --- fresh database
const admin = new pg.Client({ connectionString: ADMIN_URL });
await admin.connect();
await admin.query(`drop database if exists ${DB} with (force)`);
await admin.query(`create database ${DB}`);
await admin.end();
const url = new URL(ADMIN_URL);
url.pathname = `/${DB}`;
const db = new pg.Client({ connectionString: url.toString() });
await db.connect();

const roles = await db.query("select 1 from pg_roles where rolname = 'authenticated'");
if (roles.rowCount === 0) await db.query(readFileSync('supabase/tests/auth-stub.sql', 'utf8'));
else {
  // roles are cluster-wide: only the schema part of the stub is needed again
  await db.query(readFileSync('supabase/tests/auth-stub.sql', 'utf8').split('\n').filter((l) => !/^create role/.test(l)).join('\n'));
}
for (const f of readdirSync('supabase/migrations').sort()) {
  try {
    await db.query(readFileSync(`supabase/migrations/${f}`, 'utf8'));
    passed.push(`migration ${f}`);
  } catch (e) {
    failures.push(`migration ${f}: ${e.message}`);
  }
}

// --- helpers: run as a given user (or anon) inside a transaction, like a PostgREST request
async function as(uid, sql, params = []) {
  await db.query('begin');
  try {
    await db.query(`set local role ${uid ? 'authenticated' : 'anon'}`);
    await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(uid ? { sub: uid, role: 'authenticated' } : { role: 'anon' })]);
    const r = await db.query(sql, params);
    await db.query('commit');
    return { rows: r.rows, count: r.rowCount, error: null };
  } catch (e) {
    await db.query('rollback');
    return { rows: [], count: 0, error: e.message };
  }
}
const newUser = async () => {
  const id = randomUUID();
  await db.query('insert into auth.users (id, email) values ($1, $2)', [id, `${id.slice(0, 8)}@test.invalid`]);
  return id;
};
const NOW = Date.UTC(2026, 10, 24, 10);
const eventsFrom = (state, inst) =>
  state.logs.map((l) => ({ eventId: l.id, operation: 'create', payload: JSON.parse(createEventPayload(l, inst)) }));
const submit = (uid, events) => as(uid, 'select * from public.submit_events($1::jsonb)', [JSON.stringify(events)]);

try {
  // 1. RLS on every exposed table
  const noRls = await db.query("select tablename from pg_tables where schemaname = 'public' and not rowsecurity");
  check(noRls.rowCount === 0, '1: row-level security on every public table', noRls.rows.map((r) => r.tablename).join(','));

  const A = await newUser();
  const B = await newUser();
  const C = await newUser();

  // 2. Profiles: created automatically, private
  check((await as(A, 'select * from public.profiles')).rows.length === 1, '2: A sees exactly one profile (own)');
  check((await as(A, 'select * from public.profiles where user_id = $1', [B])).rows.length === 0, '2: A cannot read B profile');
  check((await as(A, "update public.profiles set display_name = 'x' where user_id = $1", [B])).count === 0, '2: A cannot change B profile');
  check(/permission denied/.test((await as(A, 'update public.profiles set consent_cloud_backup = true')).error ?? ''), '2: consent cannot be set by a direct update');
  check(/permission denied/.test((await as(A, 'delete from public.profiles')).error ?? ''), '2: profiles cannot be deleted directly');
  check((await as(null, 'select * from public.profiles')).error !== null || (await as(null, 'select * from public.profiles')).rows.length === 0, '2: anonymous reads nothing');

  // 3. Consent is required before anything is stored
  let s = createFreshState(NOW);
  for (let i = 0; i < 3; i += 1) s = reducer(s, { type: 'addAction', payload: { key: 'blessing', category: 'other', now: NOW + i, dateKey: '2026-11-24' } });
  s = reducer(s, { type: 'addAction', payload: { key: 'shacharit', minyan: true, onTime: true, now: NOW, dateKey: '2026-11-24' } });
  const evA = eventsFrom(s, 'device-a1');
  check(/consent_required/.test((await submit(A, evA)).error ?? ''), '3: submit without consent is refused');
  await as(A, 'select public.set_consent(true, false)');
  const r1 = await submit(A, evA);
  check(r1.rows.length === 4 && r1.rows.every((r) => r.outcome === 'accepted'), '3: with consent, 4 events accepted', JSON.stringify(r1.rows) + (r1.error ?? ''));

  // 4. Idempotency and cross-user safety
  const r2 = await submit(A, evA);
  check(r2.rows.every((r) => r.outcome === 'duplicate'), '4: resending after a lost response = duplicate, not a second copy');
  await as(B, 'select public.set_consent(true, false)');
  const r3 = await submit(B, [evA[0]]);
  check(r3.rows[0]?.outcome === 'rejected' && r3.rows[0]?.reason === 'conflict', '4: B cannot submit (or overwrite) A\'s event id');
  check((await db.query('select count(*)::int n from public.activity_events where user_id = $1', [A])).rows[0].n === 4, '4: exactly 4 events stored for A');

  // 5. Privacy at the server too
  let p = createFreshState(NOW);
  for (const key of ['speechPractice', 'charity', 'matanotLaevyonim', 'personalHabit', 'cleanSpeech', 'visitSick']) {
    p = reducer(p, { type: 'addAction', payload: { key, now: NOW, dateKey: '2026-11-24' } });
  }
  const r5 = await submit(A, eventsFrom(p, 'device-a1'));
  check(r5.rows.length === 6 && r5.rows.every((r) => r.outcome === 'rejected' && r.reason === 'private_action'), '5: private actions rejected by the server', JSON.stringify(r5.rows));
  const v1 = { ...evA[0], eventId: 'log-legacy-v1-0001', payload: { ...evA[0].payload, schemaVersion: 1 } };
  check((await submit(A, [v1])).rows[0]?.reason === 'invalid', '5: old schema v1 payloads (with city) rejected');

  // 6. No direct writes; isolation of reads
  check(/permission denied/.test((await as(A, "insert into public.activity_events (event_id, user_id, installation_id, schema_version, operation, payload) values ('log-direct-0001', $1, 'x', 2, 'create', '{}')", [A])).error ?? ''), '6: no direct insert into events');
  check(/permission denied/.test((await as(A, 'delete from public.activity_events')).error ?? ''), '6: events cannot be deleted directly');
  check(/permission denied/.test((await as(A, "update public.activity_events set action_type = 'x'")).error ?? ''), '6: events cannot be changed directly');
  check((await as(B, 'select * from public.activity_events')).rows.length === 0, '6: B reads none of A\'s events');
  check((await as(B, 'select * from public.pull_events(0)')).rows.length === 0, '6: B pulls none of A\'s events');
  check(/permission denied/.test((await as(A, "insert into public.daily_scores values ($1, '2026-11-24', 99999, 0)", [A])).error ?? ''), '6: a client cannot set its own score');
  check(/permission denied/.test((await as(A, 'update public.daily_scores set points = 99999')).error ?? ''), '6: a client cannot change its score');

  // 7. Server score = client score (same rules, same events)
  const serverScore = (await as(A, "select points from public.daily_scores where local_date = '2026-11-24'")).rows[0]?.points;
  const clientScore = scoreLogs(s.logs, s.goalHistory).byDay.get('2026-11-24');
  check(serverScore === clientScore, '7: server-side score equals the client engine', `${serverScore} vs ${clientScore}`);
  let big = createFreshState(NOW);
  for (let i = 0; i < 101; i += 1) big = reducer(big, { type: 'addAction', payload: { key: 'blessing', category: 'other', now: NOW + 1000 + i, dateKey: '2026-11-25' } });
  for (let i = 0; i < 4; i += 1) big = reducer(big, { type: 'addAction', payload: { key: 'chesed', now: NOW + 2000 + i, dateKey: '2026-11-25' } });
  const bigEvents = eventsFrom(big, 'device-a1');
  for (let i = 0; i < bigEvents.length; i += 50) await submit(A, bigEvents.slice(i, i + 50));
  const sv = (await as(A, "select points from public.daily_scores where local_date = '2026-11-25'")).rows[0]?.points;
  const cv = scoreLogs(big.logs, big.goalHistory).byDay.get('2026-11-25');
  check(sv === cv && sv === 101 * 2 + 30 + 4 * 15, '7: 101 blessings (+ goal bonus) + 4 chesed – server equals client (292)', `${sv} vs ${cv}`);

  // 8. Second device: the same account, a void (deletion) and a correction
  const voidEv = { eventId: 'log-void-device2-0001', operation: 'void', targetEventId: evA[0].eventId, payload: { schemaVersion: 2, operation: 'void', targetEventId: evA[0].eventId, installationId: 'device-a2' } };
  check((await submit(A, [voidEv])).rows[0]?.outcome === 'accepted', '8: device 2 deletes an entry made on device 1 (void)');
  const voidAgain = { ...voidEv, eventId: 'log-void-device1-0002', payload: { ...voidEv.payload, installationId: 'device-a1' } };
  check((await submit(A, [voidAgain])).rows[0]?.outcome === 'duplicate', '8: the same entry deleted on both devices – second deletion is a duplicate');
  const pulled = (await as(A, 'select event_id, operation, seq from public.pull_events(0)')).rows;
  check(pulled.some((e) => e.operation === 'void'), '8: device 1 pulls the deletion');
  const afterVoid = reducer(s, { type: 'removeLog', payload: { id: evA[0].eventId } });
  const expected = scoreLogs(afterVoid.logs, afterVoid.goalHistory).byDay.get('2026-11-24') ?? 0;
  const got = (await as(A, "select points from public.daily_scores where local_date = '2026-11-24'")).rows[0]?.points;
  check(got === expected && got < clientScore, '8: score recomputed after the deletion – equals the client engine', `${got} vs ${expected}`);
  const cursor = pulled.at(-1).seq;
  check((await as(A, 'select * from public.pull_events($1)', [cursor])).rows.length === 0, '8: cursor – nothing new after the last seq');
  const forged = { eventId: 'log-void-forged-0001', operation: 'void', targetEventId: evA[1].eventId, payload: { schemaVersion: 2, operation: 'void' } };
  check((await submit(B, [forged])).rows[0]?.reason === 'unknown_target', '8: B cannot delete A\'s entry');

  // 9. Limits
  check(/bad_batch/.test((await submit(A, Array.from({ length: 101 }, () => evA[1]))).error ?? ''), '9: more than 100 events in one request refused');
  await db.query("update public.rate_counters set hits = 999 where user_id = $1 and bucket = 'submit'", [A]);
  check(/rate_limited/.test((await submit(A, [evA[1], evA[2]])).error ?? ''), '9: hourly rate limit enforced');
  check(/permission denied/.test((await as(null, "select * from public.submit_events('[]')")).error ?? ''), '9: anonymous cannot call submit_events');
  check(/permission denied/.test((await as(A, "select public.recompute_daily_score($1, '2026-11-24')", [B])).error ?? ''), '9: internal scoring function not callable by clients');

  // 10. Export
  const ex = (await as(A, 'select public.export_my_data() as d')).rows[0]?.d;
  check(ex && ex.profile.user_id === A && ex.events.every((e) => e.user_id === A), '10: export contains only the user\'s own data');

  // 11. Social: private by default, blocking wins
  await as(A, "insert into public.social_profiles (user_id, handle, display_name) values ($1, 'user_a', 'A')", [A]);
  await as(B, "insert into public.social_profiles (user_id, handle, display_name, visible) values ($1, 'user_b', 'B', true)", [B]);
  check((await as(B, 'select * from public.social_profiles where user_id = $1', [A])).rows.length === 0, '11: social profile private by default (not friends)');
  check((await as(A, 'insert into public.friendships (requester, addressee) values ($1, $2)', [A, B])).error === null, '11: A sends a friend request');
  check((await as(C, "update public.friendships set status = 'accepted' where requester = $1", [A])).count === 0, '11: a third user cannot accept for B');
  check((await as(A, "update public.friendships set status = 'accepted' where addressee = $1", [B])).count === 0, '11: the requester cannot accept their own request');
  check((await as(B, "update public.friendships set status = 'accepted', responded_at = now() where requester = $1", [A])).count === 1, '11: B accepts');
  check((await as(A, 'select * from public.social_profiles where user_id = $1', [B])).rows.length === 1, '11: friend sees a visible social profile');
  check((await as(B, 'select * from public.social_profiles where user_id = $1', [A])).rows.length === 0, '11: friend does not see a profile that is not visible');
  check((await as(C, 'select * from public.social_profiles where user_id = $1', [B])).rows.length === 0, '11: a stranger sees nothing');
  const sh = (await as(B, "insert into public.shared_achievements (user_id, achievement_id) values ($1, 'A01') returning id", [B])).rows[0]?.id;
  check((await as(A, 'insert into public.kudos (from_user, shared_id) values ($1, $2)', [A, sh])).error === null, '11: a friend can give "יישר כוח"');
  check((await as(C, 'insert into public.kudos (from_user, shared_id) values ($1, $2)', [C, sh])).error !== null, '11: a stranger cannot');
  await as(B, 'insert into public.blocks (blocker, blocked) values ($1, $2)', [B, A]);
  check((await as(A, 'select * from public.social_profiles where user_id = $1', [B])).rows.length === 0, '11: after a block, nothing is visible');
  check((await as(A, 'select * from public.shared_achievements where user_id = $1', [B])).rows.length === 0, '11: after a block, shared achievements hidden');
  check((await as(A, 'insert into public.friendships (requester, addressee) values ($1, $2)', [A, C])).error === null && (await as(C, 'insert into public.friendships (requester, addressee) values ($1, $2)', [C, B])).error === null, '11: unrelated requests still work');
  await as(A, "insert into public.reports (reporter, reported_user, target_kind, target_id, reason) values ($1, $2, 'profile', $2, 'spam')", [A, C]);
  check((await as(C, 'select * from public.reports')).rows.length === 0, '11: the reported user cannot read reports');
  const g = (await as(A, "insert into public.groups (name, owner) values ('g', $1) returning id", [A])).rows[0]?.id;
  check((await as(C, 'select * from public.groups where id = $1', [g])).rows.length === 0, '11: non-members cannot see a group');
  check((await as(C, 'insert into public.group_members (group_id, user_id) values ($1, $2)', [g, C])).error !== null, '11: nobody joins a group directly');

  // 12. Revoking consent: stops uploads; optional deletion of cloud copies
  await as(B, 'select public.set_consent(false, false, true)');
  check(/consent_required/.test((await submit(B, [evA[1]])).error ?? ''), '12: after revoking consent, uploads are refused');

  // 13. Account deletion: everything gone; an old offline device cannot recreate it
  await as(A, 'select public.delete_my_account()');
  check((await db.query('select count(*)::int n from public.activity_events where user_id = $1', [A])).rows[0].n === 0, '13: account deletion removes all events');
  check((await db.query('select count(*)::int n from public.daily_scores where user_id = $1', [A])).rows[0].n === 0, '13: and all scores');
  check((await db.query('select count(*)::int n from public.friendships where $1 in (requester, addressee)', [A])).rows[0].n === 0, '13: and friendships');
  check(/account_deleted/.test((await submit(A, evA)).error ?? ''), '13: an old device with the old token cannot resurrect the account');
} catch (e) {
  failures.push(`exception: ${e.message}`);
} finally {
  await db.end();
}

console.log(`DB: ${passed.length} passed, ${failures.length} failed`);
for (const n of passed) console.log(`  PASS ${n}`);
for (const f of failures) console.log(`  FAIL ${f}`);
process.exit(failures.length === 0 ? 0 : 1);
