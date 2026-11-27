// Staging probe (round 13; rewritten in "לומדים יחד" after review §5ב.1). Read-only. It answers four
// separate questions and never treats one as proof of another:
//   1. service – does the project answer at all (auth health, REST)?
//   2. key     – is the key a valid PUBLIC key of this project (never a secret key)?
//   3. migrations – which repository migrations are applied? From the AUTHORITATIVE source when one
//      is available (the Management API, with a personal access token injected by a proxy or given in
//      SUPABASE_ACCESS_TOKEN), otherwise from one function or table that only that migration creates.
//   4. anonymous access – an anonymous caller is refused by every function and sees no row.
// A generic 401/403 proves nothing about a function: only "permission denied" (42501) for the anon
// role means "present and closed"; "Invalid API key" means the key is wrong; 404/PGRST202 means
// missing. The script exits 1 when a migration is missing, a check is inconclusive, or anon can reach
// anything. Signed-in permission checks (user A cannot read user B) are in the two-user acceptance run
// (scripts/staging/two-users.mjs), not here.
//   STAGING_SUPABASE_URL=https://<ref>.supabase.co STAGING_PUBLISHABLE_KEY=sb_publishable_… node scripts/staging/probe.mjs
//   node scripts/staging/probe.mjs --local     (self-test against the local stand-in; needs PostgreSQL)
import fs from 'node:fs';

const LOCAL = process.argv.includes('--local');
let url = process.env.STAGING_SUPABASE_URL ?? '';
let key = process.env.STAGING_PUBLISHABLE_KEY ?? process.env.STAGING_ANON_KEY ?? '';
const MGMT_TOKEN = process.env.SUPABASE_ACCESS_TOKEN ?? (process.env.SUPABASE_MGMT_VIA_PROXY ? 'proxy-injected' : '');
let gateway = null;

if (LOCAL) {
  const { prepareDatabase, startGateway } = await import('../gateway/local-supabase.mjs');
  const db = await prepareDatabase(process.env.DATABASE_URL ?? 'postgres://postgres@localhost:54329/postgres?host=/tmp', 'mitzvot_probe');
  gateway = await startGateway({ databaseUrl: db });
  url = gateway.url;
  key = gateway.anonKey;
} else {
  let u;
  try {
    u = new URL(url);
  } catch {
    console.error('STAGING_SUPABASE_URL is missing or not a URL.');
    process.exit(2);
  }
  if (u.protocol !== 'https:' || !u.hostname.endsWith('.supabase.co')) {
    console.error(`Refusing: ${u.origin} is not a hosted Supabase project (https://<ref>.supabase.co).`);
    process.exit(2);
  }
  const payload = (() => {
    try {
      return JSON.parse(Buffer.from(key.split('.')[1] ?? '', 'base64url').toString());
    } catch {
      return null;
    }
  })();
  if (!key || /^sb_secret_/.test(key) || payload?.role === ['service', 'role'].join('_')) {
    console.error('Refusing: give the PUBLISHABLE (or anon) key, never a secret key.');
    process.exit(2);
  }
}

const headers = { apikey: key, 'content-type': 'application/json' };
const ref = LOCAL ? null : new URL(url).hostname.split('.')[0];
const repoMigrations = fs.readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql')).map((f) => f.replace(/\.sql$/, '')).sort();

/** One marker per migration: something only that migration creates (functions are called with their own argument names). */
const MARKERS = {
  '20261126000001_core': { kind: 'rpc', name: 'export_my_data', body: {} },
  '20261126000002_social': { kind: 'table', name: 'friendships' },
  '20261126000003_seed_rules_and_privacy': { kind: 'authoritative-only' }, // data only: anon cannot read it, by design
  '20261127000001_hardening': { kind: 'rpc', name: 'share_achievement', body: { p_achievement_id: 'A07' } },
  '20261128000001_backup_generation': { kind: 'rpc', name: 'set_backup_scope', body: { p_epoch: 1, p_all: false } },
  '20261128000002_learning_together': { kind: 'rpc', name: 'create_challenge_invite', body: { p_definition: 'learn-3-of-7' } },
  '20261128000003_backup_from_now': { kind: 'rpc', name: 'backup_from_now', body: {} },
};

const classify = (status, code, msg) => {
  if (status === 404 || code === 'PGRST202' || code === 'PGRST205' || code === '42P01' || code === '42883') return 'missing';
  if (code === '42501' || /permission denied/i.test(msg)) return 'present-closed';
  if (status === 401 && /invalid api key|no api key/i.test(msg)) return 'key-invalid';
  if (status === 401 || status === 403) return 'inconclusive'; // a generic refusal proves nothing about the object
  return status < 300 ? 'OPEN-TO-ANON' : 'unexpected';
};
async function call(path, init) {
  const r = await fetch(`${url}${path}`, { headers, ...init });
  const text = await r.text();
  let j = null;
  try {
    j = JSON.parse(text);
  } catch {}
  return { status: r.status, code: j?.code ?? '', msg: String(j?.message ?? j?.msg ?? text).slice(0, 160), json: j };
}

const report = { project: new URL(url).origin, at: new Date().toISOString(), readOnly: true, service: {}, key: null, migrations: {}, anon: {}, auth: null, findings: [] };

// 1. Service.
const health = await call('/auth/v1/health').catch((e) => ({ status: 0, msg: e.message }));
report.service.auth = health.status === 200 ? 'up' : `down (${health.status} ${health.msg ?? ''})`;
const restRoot = await call('/rest/v1/').catch((e) => ({ status: 0, msg: e.message }));
report.service.rest = restRoot.status > 0 && restRoot.status < 500 ? `answers (${restRoot.status})` : `down (${restRoot.status})`;

// 2. Key: the auth settings are readable with a valid public key only.
const settings = await call('/auth/v1/settings').catch((e) => ({ status: 0, msg: e.message }));
report.key = settings.status === 200 ? 'valid public key' : settings.status === 401 ? 'INVALID key' : `unknown (${settings.status})`;
if (settings.status === 200) {
  const j = settings.json;
  report.auth = { email: Boolean(j.external?.email), google: Boolean(j.external?.google), apple: Boolean(j.external?.apple), signupDisabled: Boolean(j.disable_signup), autoconfirm: Boolean(j.mailer_autoconfirm) };
}

// 3. Migrations – authoritative first.
let authoritative = null;
if (ref && MGMT_TOKEN) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/migrations`, { headers: { Authorization: `Bearer ${MGMT_TOKEN}` } }).catch(() => null);
  if (r?.ok) authoritative = (await r.json()).map((m) => m.name);
  report.migrationsSource = authoritative ? 'Management API (authoritative)' : `Management API not readable (${r?.status ?? 'network'})`;
} else report.migrationsSource = LOCAL ? 'markers (local stand-in)' : 'markers only (no Management API token)';
for (const m of repoMigrations) {
  const marker = MARKERS[m];
  const row = { authoritative: authoritative ? authoritative.includes(m) : null };
  if (marker?.kind === 'rpc') {
    const r = await call(`/rest/v1/rpc/${marker.name}`, { method: 'POST', body: JSON.stringify(marker.body) });
    row.marker = `${marker.name}(): ${classify(r.status, r.code, r.msg)}`;
    row.markerState = classify(r.status, r.code, r.msg);
  } else if (marker?.kind === 'table') {
    const r = await call(`/rest/v1/${marker.name}?select=*&limit=1`);
    const st = r.status === 200 ? (Array.isArray(r.json) && r.json.length === 0 ? 'present-no-rows' : 'ROWS-VISIBLE') : classify(r.status, r.code, r.msg);
    row.marker = `${marker.name}: ${st}`;
    row.markerState = st === 'present-no-rows' ? 'present-closed' : st;
  } else row.markerState = 'no-marker';
  row.applied = authoritative ? row.authoritative : row.markerState === 'present-closed' ? true : row.markerState === 'missing' ? false : null;
  report.migrations[m] = row;
  if (row.applied === false) report.findings.push(`${m}: NOT applied`);
  if (row.applied === null) report.findings.push(`${m}: inconclusive (${row.marker ?? 'no marker, no authoritative source'})`);
  if (authoritative && row.authoritative && row.markerState === 'missing') report.findings.push(`${m}: recorded as applied, but its marker is missing`);
}

// 4. Anonymous access: no function reachable, no row visible.
for (const [fn, body] of [['pull_events', { p_after: 0, p_limit: 1 }], ['backup_state', {}], ['get_blessing_goals', {}]]) {
  const r = await call(`/rest/v1/rpc/${fn}`, { method: 'POST', body: JSON.stringify(body) });
  report.anon[`${fn}()`] = classify(r.status, r.code, r.msg);
}
for (const t of ['activity_events', 'profiles', 'daily_scores', 'blessing_goal_history', 'social_profiles', 'together_members']) {
  const r = await call(`/rest/v1/${t}?select=*&limit=1`);
  report.anon[t] = r.status === 200 ? (Array.isArray(r.json) && r.json.length === 0 ? 'no rows' : 'ROWS VISIBLE') : classify(r.status, r.code, r.msg);
}
for (const [k, v] of Object.entries(report.anon)) if (/OPEN-TO-ANON|ROWS VISIBLE|unexpected/.test(v)) report.findings.push(`anon ${k}: ${v}`);
if (report.key !== 'valid public key') report.findings.push(`key: ${report.key}`);
if (report.service.auth !== 'up') report.findings.push(`auth service: ${report.service.auth}`);

console.log(JSON.stringify(report, null, 2));
if (gateway) await gateway.close();
process.exit(report.findings.length ? 1 : 0);
