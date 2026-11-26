// Round 13 (review §6, step 1): look at the EXISTING staging project before changing anything in it.
// Read-only, with the public values only (the project URL and its publishable / anon key) – never a
// secret key, never a password. It changes nothing: it reads the public auth settings and asks, as an
// anonymous caller, for functions that refuse an anonymous caller before doing anything – the answer
// tells whether each migration is applied ("function not found" vs "not allowed").
//   STAGING_SUPABASE_URL=https://<ref>.supabase.co STAGING_PUBLISHABLE_KEY=sb_publishable_… node scripts/staging/probe.mjs
// Self-test against the local stand-in: node scripts/staging/probe.mjs --local (needs PostgreSQL).

const LOCAL = process.argv.includes('--local');
let url = process.env.STAGING_SUPABASE_URL ?? '';
let key = process.env.STAGING_PUBLISHABLE_KEY ?? process.env.STAGING_ANON_KEY ?? '';
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
  // Only the public key: a secret key or a service-role token is refused before any request.
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
// Functions that raise not_authenticated for an anonymous caller before touching any data.
const PROBES = [
  { migration: '20261126000001_core', fn: 'pull_events', body: { p_after: 0 } },
  { migration: '20261127000001_hardening', fn: 'pull_events', body: { p_after: 0, p_limit: 1 } },
  { migration: '20261128000001_backup_generation', fn: 'backup_state', body: {} },
  { migration: '20261128000001_backup_generation', fn: 'get_blessing_goals', body: {} },
];

async function rpc(fn, body) {
  const r = await fetch(`${url}/rest/v1/rpc/${fn}`, { method: 'POST', headers, body: JSON.stringify(body) });
  const text = await r.text();
  let j = null;
  try {
    j = JSON.parse(text);
  } catch {}
  const code = j?.code ?? '';
  const msg = String(j?.message ?? text).slice(0, 160);
  // PGRST202 / 404: no such function (with these arguments) → not applied.
  if (r.status === 404 || code === 'PGRST202') return { state: 'missing', status: r.status, code, msg };
  // Refused for an anonymous caller → the function exists and is closed to anon (as intended).
  if (r.status === 401 || r.status === 403 || code === '42501' || code === '28000' || /not_authenticated|permission denied/.test(msg)) return { state: 'present-closed', status: r.status, code };
  // Anything that ran for an anonymous caller is a finding.
  return { state: r.ok ? 'OPEN-TO-ANON' : 'unexpected', status: r.status, code, msg };
}

const report = { project: new URL(url).origin, at: new Date().toISOString(), readOnly: true, auth: null, functions: {}, tables: {} };
try {
  const s = await fetch(`${url}/auth/v1/settings`, { headers });
  if (s.ok) {
    const j = await s.json();
    report.auth = {
      email: Boolean(j.external?.email),
      google: Boolean(j.external?.google),
      apple: Boolean(j.external?.apple),
      signupDisabled: Boolean(j.disable_signup),
    };
  } else report.auth = `not readable (${s.status})`;
} catch (e) {
  report.auth = `unreachable: ${e.message}`;
}
for (const p of PROBES) report.functions[`${p.fn}(${Object.keys(p.body).join(', ')})`] = { migration: p.migration, ...(await rpc(p.fn, p.body)) };
// An anonymous caller must not see any row of the private tables.
for (const t of ['activity_events', 'profiles', 'daily_scores', 'blessing_goal_history']) {
  const r = await fetch(`${url}/rest/v1/${t}?select=*&limit=1`, { headers });
  const rows = r.ok ? await r.json().catch(() => null) : null;
  report.tables[t] = r.ok ? (Array.isArray(rows) && rows.length === 0 ? 'no rows for anon' : 'ROWS VISIBLE TO ANON') : `refused (${r.status})`;
}
const applied = {
  core: report.functions['pull_events(p_after)']?.state === 'present-closed',
  hardening: report.functions['pull_events(p_after, p_limit)']?.state === 'present-closed',
  round13: report.functions['backup_state()']?.state === 'present-closed',
};
report.migrationsApplied = applied;
report.findings = [
  ...Object.entries(report.functions).filter(([, v]) => v.state === 'OPEN-TO-ANON' || v.state === 'unexpected').map(([k, v]) => `${k}: ${v.state} (${v.status} ${v.code})`),
  ...Object.entries(report.tables).filter(([, v]) => v === 'ROWS VISIBLE TO ANON').map(([k]) => `${k}: rows visible to anon`),
];
console.log(JSON.stringify(report, null, 2));
if (gateway) await gateway.close();
process.exit(report.findings.length ? 1 : 0);
