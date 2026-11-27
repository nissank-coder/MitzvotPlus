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
const { createEventPayload, voidEventPayload } = require('../../src/sync/outbox.ts');
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
// As on Supabase: extensions are on the search path, not in public.
await db.query('set search_path = "$user", public, extensions');

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

// Fault injection (proves the tests catch regressions): DB_FAULT=<file.sql> is applied after the migrations.
if (process.env.DB_FAULT) await db.query(readFileSync(process.env.DB_FAULT, 'utf8'));

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
  const voidOf = (target, inst) => ({ eventId: `void:${target}`, operation: 'void', targetEventId: target, payload: JSON.parse(voidEventPayload(`void:${target}`, target, inst, NOW + 5000)) });
  check((await submit(A, [voidOf(evA[0].eventId, 'device-a2')])).rows[0]?.outcome === 'accepted', '8: device 2 deletes an entry made on device 1 (void)');
  check((await submit(A, [voidOf(evA[0].eventId, 'device-a1')])).rows[0]?.outcome === 'duplicate', '8: the same entry deleted on both devices – second deletion is a duplicate');
  const pulled = (await as(A, 'select event_id, operation, seq from public.pull_events(0)')).rows;
  check(pulled.some((e) => e.operation === 'void'), '8: device 1 pulls the deletion');
  const afterVoid = reducer(s, { type: 'removeLog', payload: { id: evA[0].eventId } });
  const expected = scoreLogs(afterVoid.logs, afterVoid.goalHistory).byDay.get('2026-11-24') ?? 0;
  const got = (await as(A, "select points from public.daily_scores where local_date = '2026-11-24'")).rows[0]?.points;
  check(got === expected && got < clientScore, '8: score recomputed after the deletion – equals the client engine', `${got} vs ${expected}`);
  const cursor = pulled.at(-1).seq;
  check((await as(A, 'select * from public.pull_events($1)', [cursor])).rows.length === 0, '8: cursor – nothing new after the last seq');
  check((await submit(B, [voidOf(evA[1].eventId, 'device-b1')])).rows[0]?.reason === 'unknown_target', '8: B cannot delete A\'s entry');
  const wrongVoidId = { ...voidOf(evA[1].eventId, 'device-a1'), eventId: 'log-void-random-0001' };
  wrongVoidId.payload.eventId = wrongVoidId.eventId;
  check((await submit(A, [wrongVoidId])).rows[0]?.reason === 'invalid_id', '8: a deletion must carry the deterministic id void:<target>');

  // 9. Limits
  check(/bad_batch/.test((await submit(A, Array.from({ length: 101 }, () => evA[1]))).error ?? ''), '9: more than 100 events in one request refused');
  await db.query("update public.rate_counters set hits = 999 where user_id = $1 and bucket = 'submit'", [A]);
  check(/rate_limited/.test((await submit(A, [evA[1], evA[2]])).error ?? ''), '9: hourly rate limit enforced');
  check(/permission denied/.test((await as(null, "select * from public.submit_events('[]')")).error ?? ''), '9: anonymous cannot call submit_events');
  check(/permission denied/.test((await as(A, "select public.recompute_daily_score($1, '2026-11-24')", [B])).error ?? ''), '9: internal scoring function not callable by clients');

  // 10. Export
  const ex = (await as(A, 'select public.export_my_data() as d')).rows[0]?.d;
  check(ex && ex.profile.user_id === A && ex.events.every((e) => e.user_id === A), '10: export contains only the user\'s own data');

  // 11. Social (foundation): consent on the server, invitations only, blocking wins, verified sharing
  const rpc1 = async (uid, sql, params = []) => (await as(uid, sql, params));
  const val = async (uid, sql, params = []) => { const r = await as(uid, sql, params); return r.error ?? Object.values(r.rows[0] ?? {})[0]; };
  // B needs social consent for everything social; A does not have it yet.
  await as(B, 'select public.set_consent(true, true)');
  await as(A, "insert into public.social_profiles (user_id, handle, display_name) values ($1, 'user_a', 'A')", [A]);
  await as(B, "insert into public.social_profiles (user_id, handle, display_name, visible) values ($1, 'user_b', 'B', true)", [B]);
  check(/consent_required/.test(await val(A, 'select public.create_invite()')), '11: no social consent – cannot invite');
  check(/permission denied/.test((await as(A, 'insert into public.friendships (requester, addressee) values ($1, $2)', [A, B])).error ?? ''), '11: friendships cannot be created directly (only by invitation)');
  check(/permission denied/.test((await as(A, 'insert into public.invites (inviter) values ($1)', [A])).error ?? ''), '11: invitations cannot be inserted directly');
  const code = await val(B, 'select public.create_invite()');
  check(/^[0-9a-f]{24}$/.test(code), '11: B (with consent) creates a single-use invitation', String(code));
  check(/consent_required/.test(await val(A, 'select public.redeem_invite($1)', [code])), '11: A without social consent cannot redeem');
  await as(A, 'select public.set_consent(true, true)');
  check((await val(C, 'select public.set_consent(false, true)')) !== undefined && (await val(C, 'select public.redeem_invite($1)', ['0'.repeat(24)])) === 'invalid', '11: a wrong code gives the generic answer');
  check((await val(A, 'select public.redeem_invite($1)', [code])) === 'ok', '11: A redeems – A and B are friends');
  check((await val(C, 'select public.redeem_invite($1)', [code])) === 'invalid', '11: an invitation works only once');
  check((await as(B, 'select * from public.social_profiles where user_id = $1', [A])).rows.length === 0, '11: friend does not see a profile that is not visible');
  check((await as(A, 'select * from public.social_profiles where user_id = $1', [B])).rows.length === 1, '11: friend sees a visible social profile');
  check((await as(C, 'select * from public.social_profiles where user_id = $1', [B])).rows.length === 0, '11: a stranger sees nothing');
  const expired = await val(B, 'select public.create_invite()');
  await db.query("update public.invites set expires_at = now() - interval '1 minute' where code = $1", [expired]);
  check((await val(C, 'select public.redeem_invite($1)', [expired])) === 'invalid', '11: an expired invitation is refused');
  // Sharing: only achievements the server can verify from backed-up events.
  check(/permission denied/.test((await as(B, "insert into public.shared_achievements (user_id, achievement_id) values ($1, 'A07')", [B])).error ?? ''), '11: achievements cannot be inserted directly');
  check((await val(B, "select public.share_achievement('A07')")) === 'not_earned', '11: an achievement not earned on the server cannot be shared');
  check((await val(B, "select public.share_achievement('A01')")) === 'not_verifiable', '11: an achievement the server cannot verify cannot be shared');
  let bl = createFreshState(NOW);
  for (let i = 0; i < 100; i += 1) bl = reducer(bl, { type: 'addAction', payload: { key: 'blessing', category: 'other', now: NOW + 3000 + i, dateKey: '2026-11-23' } });
  const blEvents = eventsFrom(bl, 'device-b1');
  await submit(B, blEvents.slice(0, 100));
  check((await val(B, "select public.share_achievement('A07')")) === 'shared', '11: 100 blessings in a day on the server – A07 can be shared');
  const sh = (await as(B, "select id from public.shared_achievements where achievement_id = 'A07'")).rows[0]?.id;
  check((await as(A, 'select * from public.shared_achievements where id = $1', [sh])).rows.length === 1, '11: a friend sees the shared achievement');
  check((await val(A, 'select public.give_kudos($1)', [sh])) === 'ok', '11: a friend can give "יישר כוח"');
  check((await val(C, 'select public.give_kudos($1)', [sh])) === 'unavailable', '11: a stranger cannot');
  check(/permission denied/.test((await as(C, 'insert into public.kudos (from_user, shared_id) values ($1, $2)', [C, sh])).error ?? ''), '11: kudos cannot be inserted directly');
  // Visibility and consent: hiding the profile or withdrawing consent hides shared achievements too.
  await as(B, 'update public.social_profiles set visible = false where user_id = $1', [B]);
  check((await as(A, 'select * from public.shared_achievements where id = $1', [sh])).rows.length === 0, '11: profile hidden – shared achievements hidden');
  await as(B, 'update public.social_profiles set visible = true where user_id = $1', [B]);
  await as(B, 'select public.set_consent(true, false)');
  check((await as(A, 'select * from public.shared_achievements where id = $1', [sh])).rows.length === 0, '11: social consent withdrawn – shared achievements hidden');
  check((await as(B, 'select visible from public.social_profiles where user_id = $1', [B])).rows[0]?.visible === false, '11: and the profile does not become visible again by itself');
  check(/consent_required/.test(await val(B, "select public.share_achievement('A07')")), '11: without social consent nothing can be shared');
  await as(B, 'select public.set_consent(true, true)');
  await as(B, 'update public.social_profiles set visible = true where user_id = $1', [B]);
  check((await as(A, 'select * from public.shared_achievements where id = $1', [sh])).rows.length === 1, '11: after a new consent and visibility, visible again');
  // Blocking wins: friendship, feed, kudos, groups.
  const g = (await as(B, "insert into public.groups (name, owner) values ('g', $1) returning id", [B])).rows[0]?.id;
  check(g && (await as(C, 'select * from public.groups where id = $1', [g])).rows.length === 0, '11: non-members cannot see a group');
  check(/permission denied/.test((await as(C, 'insert into public.group_members (group_id, user_id) values ($1, $2)', [g, C])).error ?? ''), '11: nobody joins a group directly');
  const D = await newUser();
  check(/row-level security|violates/.test((await as(D, "insert into public.groups (name, owner) values ('x', $1)", [D])).error ?? ''), '11: no social consent – cannot create a group');
  await db.query('insert into public.group_members (group_id, user_id) values ($1, $2), ($1, $3)', [g, A, B]);
  check((await as(A, 'select user_id from public.group_members where group_id = $1', [g])).rows.length === 2, '11: members see each other');
  await as(B, 'select public.block_user($1)', [A]);
  check((await as(A, 'select * from public.social_profiles where user_id = $1', [B])).rows.length === 0, '11: after a block, the profile is not visible');
  check((await as(A, 'select * from public.shared_achievements where user_id = $1', [B])).rows.length === 0, '11: after a block, shared achievements hidden');
  check((await db.query('select count(*)::int n from public.friendships where (requester = $1 and addressee = $2) or (requester = $2 and addressee = $1)', [A, B])).rows[0].n === 0, '11: a block ends the friendship');
  check((await db.query('select count(*)::int n from public.kudos where from_user = $1', [A])).rows[0].n === 0, '11: and removes the kudos');
  check((await as(A, 'select user_id from public.group_members where group_id = $1', [g])).rows.every((r) => r.user_id !== B), '11: in a shared group, the blocked member is not visible');
  check((await val(A, 'select public.give_kudos($1)', [sh])) === 'unavailable', '11: no kudos across a block');
  const code2 = await val(B, 'select public.create_invite()');
  check((await val(A, 'select public.redeem_invite($1)', [code2])) === 'invalid', '11: an invitation cannot get around a block');
  check((await as(A, 'select * from public.blocks')).rows.length === 0, '11: A cannot see that B blocked them');
  check((await val(B, 'select public.block_user($1)', ['00000000-0000-4000-8000-000000000000'])) !== undefined, '11: blocking an unknown id reveals nothing (no error)');
  await as(A, "select public.submit_report('profile', $1, 'spam', null, $2)", [C, C]);
  check((await as(C, 'select * from public.reports')).rows.length === 0, '11: the reported user cannot read reports');
  check(/permission denied/.test((await as(A, "insert into public.reports (reporter, target_kind, target_id, reason) values ($1, 'profile', 'x', 'spam')", [A])).error ?? ''), '11: reports only through the rate-limited function');
  // Helpers are not reachable through the API (schema "private" is not exposed).
  const helpers = (await db.query("select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and proname in ('are_friends', 'is_blocked_between', 'is_group_member', 'blocked_between', 'friends')")).rows;
  check(helpers.length === 0, '11: no relationship helper in the exposed schema', JSON.stringify(helpers));

  // 12. Revoking consent: stops uploads; optional deletion of cloud copies
  await as(B, 'select public.set_consent(false, false, true)');
  check(/consent_required/.test((await submit(B, [evA[1]])).error ?? ''), '12: after revoking consent, uploads are refused');

  // 13. Account deletion: everything gone; an old offline device cannot recreate it
  await as(A, 'select public.delete_my_account()');
  check((await db.query('select count(*)::int n from public.activity_events where user_id = $1', [A])).rows[0].n === 0, '13: account deletion removes all events');
  check((await db.query('select count(*)::int n from public.daily_scores where user_id = $1', [A])).rows[0].n === 0, '13: and all scores');
  check((await db.query('select count(*)::int n from public.friendships where $1 in (requester, addressee)', [A])).rows[0].n === 0, '13: and friendships');
  check(/account_deleted/.test((await submit(A, evA)).error ?? ''), '13: an old device with the old token cannot resurrect the account');
  // 14. Privileges audit – against Supabase's defaults (the stub grants ALL to anon/authenticated)
  const anonTables = (await db.query("select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and (has_table_privilege('anon', c.oid, 'select') or has_table_privilege('anon', c.oid, 'insert') or has_table_privilege('anon', c.oid, 'update') or has_table_privilege('anon', c.oid, 'delete'))")).rows;
  check(anonTables.length === 0, '14: the anonymous role has no access to any table', JSON.stringify(anonTables));
  const fnPriv = async (role) => (await db.query(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and has_function_privilege('${role}', p.oid, 'execute') order by 1`)).rows.map((r) => r.proname);
  check((await fnPriv('anon')).length === 0, '14: the anonymous role can call no function', (await fnPriv('anon')).join(','));
  const API = ['backup_state', 'block_user', 'create_invite', 'delete_my_account', 'export_my_data', 'get_blessing_goals', 'give_kudos', 'pull_events', 'redeem_invite', 'set_backup_scope', 'set_blessing_goals', 'set_consent', 'share_achievement', 'submit_events', 'submit_report'];
  check(JSON.stringify(await fnPriv('authenticated')) === JSON.stringify(API), '14: signed-in users can call exactly the API functions', (await fnPriv('authenticated')).join(','));
  const writes = (await db.query("select c.relname || ':' || string_agg(p, ',' order by p) w from pg_class c join pg_namespace n on n.oid = c.relnamespace cross join unnest(array['INSERT','UPDATE','DELETE']) p where n.nspname = 'public' and c.relkind = 'r' and (has_table_privilege('authenticated', c.oid, p) or (p <> 'DELETE' and has_any_column_privilege('authenticated', c.oid, p))) group by c.relname order by 1")).rows.map((r) => r.w);
  const WRITES = ['blocks:DELETE', 'friendships:DELETE', 'group_members:DELETE', 'groups:DELETE,INSERT,UPDATE', 'invites:DELETE', 'kudos:DELETE', 'profiles:UPDATE', 'shared_achievements:DELETE', 'social_profiles:DELETE,INSERT,UPDATE'];
  check(JSON.stringify(writes) === JSON.stringify(WRITES), '14: direct writes exist only where intended (no events, scores, consent, rules)', writes.join(' '));
  const cols = (await db.query("select column_name from information_schema.column_privileges where grantee = 'authenticated' and table_name = 'profiles' and privilege_type = 'UPDATE' order by 1")).rows.map((r) => r.column_name);
  check(JSON.stringify(cols) === '["display_name"]', '14: on the private profile only the display name can be changed', cols.join(','));

  // 15. Malformed events: allow-list of fields, types, dates, ids
  const E = await newUser();
  await as(E, 'select public.set_consent(true, false)');
  let m = createFreshState(NOW);
  m = reducer(m, { type: 'addAction', payload: { key: 'chesed', now: NOW, dateKey: '2026-11-24' } });
  const good = eventsFrom(m, 'device-e1')[0];
  const variant = (id, change) => {
    const ev = JSON.parse(JSON.stringify(good));
    ev.eventId = id;
    ev.payload.eventId = id;
    change(ev);
    return ev;
  };
  const cases = [
    ['private field on an allowed action', variant('log-mal-0001', (e) => { e.payload.note = 'גבאי – פרטי'; }), 'unexpected_field'],
    ['city in the calendar context', variant('log-mal-0002', (e) => { e.payload.calendarContext = { tzid: 'Asia/Jerusalem', il: true, cityId: 'bnei-brak' }; }), 'unexpected_field'],
    ['a time that is not a UTC timestamp', variant('log-mal-0003', (e) => { e.payload.occurredAtUtc = 'yesterday'; }), 'invalid_time'],
    ['a time in the future', variant('log-mal-0004', (e) => { e.payload.occurredAtUtc = new Date(Date.now() + 10 * 86400000).toISOString(); }), 'invalid_time'],
    ['a local date far from the time', variant('log-mal-0005', (e) => { e.payload.localDate = '2026-10-01'; }), 'invalid_date'],
    ['a flag of the wrong type', variant('log-mal-0006', (e) => { e.payload.minyan = 'yes'; }), 'invalid_flag'],
    ['an unknown rules version', variant('log-mal-0007', (e) => { e.payload.rulesVersion = 'score-99'; }), 'unknown_rules'],
    ['no rules version (legacy entry)', variant('log-mal-0008', (e) => { delete e.payload.rulesVersion; }), 'unknown_rules'],
    ['payload id differs from the envelope', variant('log-mal-0009', (e) => { e.payload.eventId = 'log-other-0009'; }), 'mismatch'],
    ['a reference that is too long', variant('log-mal-0010', (e) => { e.payload.refId = 'x'.repeat(300); }), 'invalid_ref'],
    ['a bundle on an action that is not a blessing', variant('log-mal-0011', (e) => { e.payload.bundleOf = 'log-src-0001'; }), 'invalid_bundle'],
    ['an oversized payload', variant('log-mal-0012', (e) => { e.payload.junk = 'x'.repeat(3000); }), 'too_large'],
    ['a quantity other than 1', variant('log-mal-0013', (e) => { e.payload.quantity = 5; }), 'invalid_quantity'],
    ['schema version as text', variant('log-mal-0014', (e) => { e.payload.schemaVersion = '2'; }), 'invalid'],
    ['an id with forbidden characters', variant("log-mal-0015'; drop table x;--", () => undefined), 'invalid'],
    ['a void with an extra field', { eventId: `void:${good.eventId}`, operation: 'void', targetEventId: good.eventId, payload: { ...JSON.parse(voidEventPayload(`void:${good.eventId}`, good.eventId, 'device-e1', NOW)), reason: 'x' } }, 'unexpected_field'],
  ];
  const res = await submit(E, [...cases.map((c) => c[1]), 'not an object', good]);
  check(res.error === null && res.rows.length === cases.length + 2, '15: a batch with malformed items is answered item by item (no crash)', res.error ?? String(res.rows.length));
  cases.forEach(([name, , reason], i) => check(res.rows[i]?.outcome === 'rejected' && res.rows[i]?.reason === reason, `15: refused – ${name}`, JSON.stringify(res.rows[i])));
  check(res.rows[cases.length]?.reason === 'invalid', '15: refused – an element that is not an object');
  check(res.rows.at(-1)?.outcome === 'accepted', '15: the valid event in the same batch is accepted');
  check((await db.query('select count(*)::int n from public.activity_events where user_id = $1', [E])).rows[0].n === 1, '15: nothing malformed was stored');
  const stored = (await db.query('select payload from public.activity_events where user_id = $1', [E])).rows[0].payload;
  check(Object.keys(stored).every((k) => ['eventId', 'installationId', 'schemaVersion', 'operation', 'actionType', 'quantity', 'occurredAtUtc', 'recordedAtUtc', 'localDate', 'calendarContext', 'rulesVersion', 'onTime', 'category', 'refId', 'minyan', 'backfill', 'contentId', 'contentVersion', 'bundleOf'].includes(k)), '15: the stored payload holds only allowed fields');

  // 16. Server score = client score: goal changes, rules versions, bundles, order, after-the-fact
  const F = await newUser();
  await as(F, 'select public.set_consent(true, false)');
  let f = createFreshState(NOW);
  for (let i = 0; i < 60; i += 1) f = reducer(f, { type: 'addAction', payload: { key: 'blessing', category: 'other', now: Date.UTC(2026, 10, 20, 8) + i * 1000, dateKey: '2026-11-20' } });
  f = reducer(f, { type: 'updateGoals', payload: { blessingGoal: 50 }, dateKey: '2026-11-21' });
  for (let i = 0; i < 60; i += 1) f = reducer(f, { type: 'addAction', payload: { key: 'blessing', category: 'other', now: Date.UTC(2026, 10, 21, 8) + i * 1000, dateKey: '2026-11-21' } });
  // Mixed rules versions on one day, up to the cap.
  for (let i = 0; i < 8; i += 1) f = reducer(f, { type: 'addAction', payload: { key: 'chesed', now: Date.UTC(2026, 10, 22, 8) + i * 1000, dateKey: '2026-11-22' } });
  f = { ...f, logs: f.logs.map((l, i) => (l.dateKey === '2026-11-22' && i % 2 === 0 ? { ...l, rules: 'score-2' } : l)) };
  // Order: two once-a-day prayers at the same moment; ids differ only in letter case.
  const t0 = Date.UTC(2026, 10, 22, 6);
  const tmpl = reducer(createFreshState(NOW), { type: 'addAction', payload: { key: 'shacharit', now: t0, dateKey: '2026-11-22' } }).logs[0];
  f = { ...f, logs: [{ ...tmpl, id: 'log-a-order', minyan: true }, { ...tmpl, id: 'log-B-order' }, ...f.logs] };
  // A prayer with a confirmed blessing bundle.
  f = reducer(f, { type: 'addAction', payload: { key: 'birkatHamazon', now: Date.UTC(2026, 10, 23, 12), dateKey: '2026-11-23' } });
  const src = f.logs.find((l) => l.actionKey === 'birkatHamazon');
  f = src ? reducer(f, { type: 'setBlessingBundle', payload: { sourceLogId: src.id, count: 5, now: Date.UTC(2026, 10, 23, 12, 1) } }) : f;
  // After-the-fact entry for an earlier day.
  f = reducer(f, { type: 'addAction', payload: { key: 'kiddush', backfill: true, now: Date.UTC(2026, 10, 23, 19), dateKey: '2026-11-21' } });
  const fGoals = f.goalHistory.map((x) => ({ from: x.from, blessingGoal: x.blessingGoal }));
  check((await as(F, 'select public.set_blessing_goals($1::jsonb, 0)', [JSON.stringify(fGoals)])).error === null, '16: goal history accepted');
  const fEvents = eventsFrom(f, 'device-f1');
  for (let i = 0; i < fEvents.length; i += 100) await submit(F, fEvents.slice(i, i + 100));
  const parity = async (state, label) => {
    const client = scoreLogs(state.logs, state.goalHistory).byDay;
    const server = new Map((await as(F, 'select local_date::text d, points from public.daily_scores')).rows.map((r) => [r.d, r.points]));
    const days = [...new Set([...client.keys(), ...server.keys()])].sort();
    const diff = days.filter((d) => (client.get(d) ?? 0) !== (server.get(d) ?? 0)).map((d) => `${d}: client ${client.get(d) ?? 0} / server ${server.get(d) ?? 0}`);
    check(diff.length === 0 && days.length > 0, `16: ${label}`, diff.join('; '));
  };
  await parity(f, 'every day equals the client engine (goal change, mixed versions, order, bundle, after-the-fact)');
  // A deletion on the day before the goal change is rescored with THAT day's goal (100), not today's.
  const oneBlessing = f.logs.find((l) => l.dateKey === '2026-11-20' && l.actionKey === 'blessing');
  const f2 = reducer(f, { type: 'removeLog', payload: { id: oneBlessing.id } });
  await submit(F, [voidOf(oneBlessing.id, 'device-f1')]);
  await parity(f2, 'after a deletion on an old day – scored with the goal in force on that day');
  // The bundle is reduced: the removed blessings become deletions.
  const f3 = src ? reducer(f2, { type: 'setBlessingBundle', payload: { sourceLogId: src.id, count: 2, now: Date.UTC(2026, 10, 23, 12, 2) } }) : f2;
  const gone = f2.logs.filter((l) => !f3.logs.some((x) => x.id === l.id));
  await submit(F, gone.map((l) => voidOf(l.id, 'device-f1')));
  await parity(f3, 'after the bundle was reduced from 5 to 2');
  // The goal is changed again (for today on): history only, old days do not move.
  const f4 = reducer(f3, { type: 'updateGoals', payload: { blessingGoal: 200 }, dateKey: '2026-11-24' });
  await as(F, 'select public.set_blessing_goals($1::jsonb, 1)', [JSON.stringify(f4.goalHistory.map((x) => ({ from: x.from, blessingGoal: x.blessingGoal })))]);
  await parity(f4, 'a new goal does not change the score of earlier days');
  check(/bad_goal/.test((await as(F, "select public.set_blessing_goals('[{\"from\":\"2026-11-01\",\"blessingGoal\":5000}]'::jsonb, 2)")).error ?? ''), '16: an impossible goal is refused');

  // 17. Concurrency: one account's uploads, consent changes and deletion are serialized
  const session = async () => {
    const c = new pg.Client({ connectionString: url.toString() });
    await c.connect();
    await c.query('set search_path = "$user", public, extensions');
    return c;
  };
  const begin = async (c, uid) => {
    await c.query('begin');
    await c.query('set local role authenticated');
    await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: uid, role: 'authenticated' })]);
  };
  const G = await newUser();
  await as(G, 'select public.set_consent(true, false)');
  let gs = createFreshState(NOW);
  for (let i = 0; i < 2; i += 1) gs = reducer(gs, { type: 'addAction', payload: { key: 'chesed', now: NOW + i * 1000, dateKey: '2026-11-24' } });
  const [g1, g2] = eventsFrom(gs, 'device-g1');
  const c1 = await session();
  const c2 = await session();
  // (a) Upload of device 1 in flight; device 2 uploads at the same time → waits, then gets the higher seq.
  await begin(c1, G);
  await c1.query('select * from public.submit_events($1::jsonb)', [JSON.stringify([g1])]);
  await begin(c2, G);
  let done2 = false;
  const p2 = c2.query('select * from public.submit_events($1::jsonb)', [JSON.stringify([g2])]).then((r) => { done2 = true; return r; });
  await new Promise((r) => setTimeout(r, 400));
  check(!done2, '17: a second upload of the same account waits for the first');
  check((await as(G, 'select * from public.pull_events(0)')).rows.length === 0, '17: nothing uncommitted is visible to a pull');
  await c1.query('commit');
  await p2;
  await c2.query('commit');
  const seqs = (await as(G, 'select event_id, seq from public.pull_events(0)')).rows;
  check(seqs.length === 2 && seqs[0].event_id === g1.eventId && seqs[1].seq > seqs[0].seq, '17: commit order = seq order – a cursor cannot skip an event', JSON.stringify(seqs));
  // (b) Consent revoked while an upload waits → the upload is refused, nothing stored.
  let gs2 = reducer(gs, { type: 'addAction', payload: { key: 'chesed', now: NOW + 5000, dateKey: '2026-11-24' } });
  const g3 = eventsFrom(gs2, 'device-g2').find((e) => e.eventId === gs2.logs[0].id);
  await begin(c1, G);
  await c1.query('select public.set_consent(false, false)');
  await begin(c2, G);
  const p3 = c2.query('select * from public.submit_events($1::jsonb)', [JSON.stringify([g3])]).then(() => null, (e) => e.message);
  await new Promise((r) => setTimeout(r, 300));
  await c1.query('commit');
  const err3 = await p3;
  await c2.query('rollback');
  check(/consent_required/.test(err3 ?? ''), '17: consent revoked during an upload – the upload is refused', String(err3));
  check((await db.query('select count(*)::int n from public.activity_events where user_id = $1', [G])).rows[0].n === 2, '17: and nothing of it was stored');
  // (c) Account deleted while an upload waits → refused, nothing recreated.
  await as(G, 'select public.set_consent(true, false)');
  await begin(c1, G);
  await c1.query('select public.delete_my_account()');
  await begin(c2, G);
  const p4 = c2.query('select * from public.submit_events($1::jsonb)', [JSON.stringify([g3])]).then(() => null, (e) => e.message);
  await new Promise((r) => setTimeout(r, 300));
  await c1.query('commit');
  const err4 = await p4;
  await c2.query('rollback');
  check(/account_deleted/.test(err4 ?? ''), '17: account deleted during an upload – the upload is refused', String(err4));
  check((await db.query('select count(*)::int n from public.activity_events where user_id = $1', [G])).rows[0].n === 0, '17: and the deleted account has no events');
  check(/account_deleted/.test((await as(G, 'select * from public.pull_events(0)')).error ?? ''), '17: a pull after deletion reports the deletion');

  // 18. Backup generation (round 13, review B1): the server enforces the user's choice for every device
  const H = await newUser();
  await as(H, 'select public.set_consent(true, false)');
  let hs = reducer(createFreshState(NOW), { type: 'addAction', payload: { key: 'shacharit', now: NOW, dateKey: '2026-11-24' } });
  const h1 = eventsFrom(hs, 'device-h1');
  const state = async () => (await as(H, 'select public.backup_state() s')).rows[0]?.s;
  const st1 = await state();
  check(st1?.epoch === 1 && st1.floor === null && st1.decisionPending === false, '18: a new account: generation 1, no floor, nothing to decide', JSON.stringify(st1));
  check((await submit(H, h1)).rows[0]?.outcome === 'accepted', '18: generation 1: an upload of a client from before round 13 (no epoch) is accepted');
  await as(H, 'select public.set_consent(false, false, true)');
  await as(H, 'select public.set_consent(true, false)');
  const st2 = await state();
  check(st2?.epoch === 2 && st2.decisionPending === true, '18: deleting the cloud copy starts generation 2 and waits for the choice', JSON.stringify(st2));
  check(/backup_decision_required/.test((await as(H, 'select * from public.submit_events($1::jsonb, 2)', [JSON.stringify(h1)])).error ?? ''), '18: while the choice is open, nothing is accepted from any device');
  check(/backup_epoch_changed/.test((await as(H, 'select public.set_backup_scope(1, true)')).error ?? ''), '18: an answer for an older generation is refused');
  const st3 = (await as(H, 'select public.set_backup_scope(2, false) s')).rows[0]?.s;
  check(st3?.floor !== null && st3?.decisionPending === false, '18: "only from now" sets the floor', JSON.stringify(st3));
  const st4 = (await as(H, 'select public.set_backup_scope(2, true) s')).rows[0]?.s;
  check(st4?.floor === st3?.floor, '18: a late answer from another device does not change the decision', JSON.stringify(st4));
  check(/backup_epoch_changed/.test((await submit(H, h1)).error ?? ''), '18: a device still on the old generation (offline during the deletion) is refused');
  check(/backup_epoch_changed/.test((await as(H, 'select * from public.submit_events($1::jsonb, 1)', [JSON.stringify(h1)])).error ?? ''), '18: naming the old generation explicitly is refused too');
  const old = await as(H, 'select * from public.submit_events($1::jsonb, 2)', [JSON.stringify(h1)]);
  check(old.rows[0]?.outcome === 'rejected' && old.rows[0]?.reason === 'before_backup_floor', '18: an entry recorded before "only from now" is refused, even with the right generation', JSON.stringify(old.rows));
  const later = Date.now() + 1000;
  hs = reducer(hs, { type: 'addAction', payload: { key: 'mincha', now: later, dateKey: new Date(later).toISOString().slice(0, 10) } });
  const fresh = eventsFrom(hs, 'device-h1').filter((e) => e.eventId === hs.logs[0].id);
  check((await as(H, 'select * from public.submit_events($1::jsonb, 2)', [JSON.stringify(fresh)])).rows[0]?.outcome === 'accepted', '18: an entry recorded after the choice is backed up');
  await as(H, 'select public.set_consent(false, false, true)');
  await as(H, 'select public.set_consent(true, false)');
  check((await as(H, 'select public.set_backup_scope(3, true) s')).rows[0]?.s?.floor === null, '18: "all history" has no floor');
  check((await as(H, 'select * from public.submit_events($1::jsonb, 3)', [JSON.stringify(h1)])).rows[0]?.outcome === 'accepted', '18: "all history": an old entry is accepted again in the new generation');
  check(/permission denied/.test((await as(H, 'update public.profiles set backup_floor = null, backup_epoch = 1, backup_decision_pending = false')).error ?? ''), '18: the generation, the floor and the pending choice cannot be changed directly');
  check(/permission denied/.test((await as(null, 'select public.backup_state()')).error ?? ''), '18: the anonymous role cannot read a backup state');

  // 19. Goal history with a version (round 13, review B2): a stale phone cannot silently undo a change
  const K = await newUser();
  await as(K, 'select public.set_consent(true, false)');
  const goalsOf = async () => (await as(K, 'select public.get_blessing_goals() g')).rows[0]?.g;
  const k0 = await goalsOf();
  check(k0?.version === 0 && k0.goals.length === 0, '19: a new account has no goal history (version 0)', JSON.stringify(k0));
  const a50 = [{ from: '0000-00-00', blessingGoal: 100, setAt: 0 }, { from: '2026-11-24', blessingGoal: 50, setAt: NOW }];
  const b100 = [{ from: '0000-00-00', blessingGoal: 100, setAt: 0 }];
  check((await as(K, 'select public.set_blessing_goals($1::jsonb, 0) v', [JSON.stringify(a50)])).rows[0]?.v === 1, '19: phone A writes on version 0 → version 1');
  check(/goals_conflict/.test((await as(K, 'select public.set_blessing_goals($1::jsonb, 0)', [JSON.stringify(b100)])).error ?? ''), "19: phone B, still on version 0, cannot replace A's change");
  check(/goals_conflict/.test((await as(K, 'select public.set_blessing_goals($1::jsonb, null)', [JSON.stringify(b100)])).error ?? ''), '19: a write without a base version is refused');
  const k1 = await goalsOf();
  check(k1?.version === 1 && k1.goals.some((x) => x.from === '2026-11-24' && x.blessingGoal === 50 && Number(x.setAt) === NOW), "19: the server keeps A's change and the time it was set", JSON.stringify(k1));
  check(k1?.goals[0]?.from === '0000-00-00', '19: the first goal is "since always"', JSON.stringify(k1?.goals[0]));
  const merged = [...a50, { from: '2026-11-26', blessingGoal: 120, setAt: NOW + 1 }];
  check((await as(K, 'select public.set_blessing_goals($1::jsonb, 1) v', [JSON.stringify(merged)])).rows[0]?.v === 2, '19: B writes its merge on version 1 → version 2');
  await as(K, 'select public.set_consent(false, false, true)');
  await as(K, 'select public.set_consent(true, false)');
  const k2 = await goalsOf();
  check(k2?.version === 3 && k2.goals.length === 0, '19: deleting the cloud copy clears the goals and moves the version on', JSON.stringify(k2));

  await c1.end();
  await c2.end();
} catch (e) {
  failures.push(`exception: ${e.message}`);
} finally {
  await db.end();
}

console.log(`DB: ${passed.length} passed, ${failures.length} failed`);
for (const n of passed) console.log(`  PASS ${n}`);
for (const f of failures) console.log(`  FAIL ${f}`);
process.exit(failures.length === 0 ? 0 : 1);
