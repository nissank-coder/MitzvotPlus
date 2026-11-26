// TEST ONLY – a local stand-in for the two Supabase services the app uses, on top of a REAL
// PostgreSQL with the real migrations: Auth (GoTrue: e-mail one-time code, session, refresh,
// logout) and the REST API (PostgREST: RPC calls and the profile read). It lets the app's own code
// (supabase-js, src/backend/account.ts, the sync engine) run end to end without a hosted project.
// It is NOT Supabase: e-mail delivery is a test mailbox, JWTs are signed with a per-run secret.
// Never deployed, never part of an app build (check:release forbids it).
import http from 'node:http';
import { createHmac, randomBytes, randomInt, randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import pg from 'pg';

const b64url = (buf) => Buffer.from(buf).toString('base64url');

export async function prepareDatabase(adminUrl, name = 'mitzvot_gateway') {
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(`drop database if exists ${name} with (force)`);
  await admin.query(`create database ${name}`);
  await admin.end();
  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  const db = new pg.Client({ connectionString: url.toString() });
  await db.connect();
  await db.query('set search_path = "$user", public, extensions');
  const hasRoles = (await db.query("select 1 from pg_roles where rolname = 'authenticated'")).rowCount > 0;
  const stub = readFileSync('supabase/tests/auth-stub.sql', 'utf8');
  await db.query(hasRoles ? stub.split('\n').filter((l) => !/^create role/.test(l)).join('\n') : stub);
  for (const f of readdirSync('supabase/migrations').sort()) await db.query(readFileSync(`supabase/migrations/${f}`, 'utf8'));
  await db.end();
  return url.toString();
}

export async function startGateway({ databaseUrl, port = 0, accessTtlSeconds = 3600, otpTtlSeconds = 600, otpResendSeconds = 60 }) {
  const secret = randomBytes(32);
  const anonKey = sign({ role: 'anon', iss: 'local-gateway' }, 10 * 365 * 86400);
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 8 });
  pool.on('connect', (c) => c.query('set search_path = "$user", public, extensions'));
  const codes = new Map(); // email → { code, expiresAt, attempts, sentAt }
  const mailbox = new Map(); // email → last code (synthetic delivery)
  const refreshTokens = new Map(); // token → { userId, revoked }
  const stats = { refreshes: 0, otpRequests: 0, rpc: {} };
  let offline = false;

  function sign(payload, ttl) {
    const now = Math.floor(Date.now() / 1000);
    const head = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const body = b64url(JSON.stringify({ ...payload, iat: now, exp: now + ttl }));
    const sig = b64url(createHmac('sha256', secret).update(`${head}.${body}`).digest());
    return `${head}.${body}.${sig}`;
  }
  function verify(token) {
    const [h, b, s] = String(token ?? '').split('.');
    if (!h || !b || !s) return null;
    const expected = b64url(createHmac('sha256', secret).update(`${h}.${b}`).digest());
    if (expected !== s) return null;
    const claims = JSON.parse(Buffer.from(b, 'base64url').toString());
    if (claims.exp < Math.floor(Date.now() / 1000)) return null;
    return claims;
  }
  const userJson = (u) => ({ id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email, app_metadata: { provider: 'email' }, user_metadata: {}, created_at: u.created_at });
  async function session(u) {
    const refresh = b64url(randomBytes(24));
    refreshTokens.set(refresh, { userId: u.id, revoked: false });
    const access = sign({ sub: u.id, email: u.email, role: 'authenticated', aud: 'authenticated' }, accessTtlSeconds);
    return { access_token: access, token_type: 'bearer', expires_in: accessTtlSeconds, expires_at: Math.floor(Date.now() / 1000) + accessTtlSeconds, refresh_token: refresh, user: userJson(u) };
  }

  async function asRole(claims, fn) {
    const c = await pool.connect();
    try {
      await c.query('begin');
      await c.query(`set local role ${claims ? 'authenticated' : 'anon'}`);
      await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims ?? { role: 'anon' })]);
      const r = await fn(c);
      await c.query('commit');
      return r;
    } catch (e) {
      await c.query('rollback').catch(() => undefined);
      throw e;
    } finally {
      c.release();
    }
  }

  const send = (res, status, body, extra = {}) => {
    res.writeHead(status, { 'content-type': 'application/json', ...cors, ...extra });
    res.end(body === undefined ? '' : JSON.stringify(body));
  };
  const cors = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info, accept-profile, content-profile, prefer, x-supabase-api-version, accept',
    'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  };
  const authError = (res, status, code, msg) => send(res, status, { code: status, error_code: code, msg });
  const pgError = (res, e) => send(res, e.code === '42501' ? 403 : e.code === '28000' ? 401 : 400, { code: e.code, message: e.message, details: e.detail ?? null, hint: e.hint ?? null });

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://local');
      if (req.method === 'OPTIONS') return send(res, 204);
      const chunks = [];
      for await (const ch of req) chunks.push(ch);
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString() || 'null') : null;
      // ---- test controls
      if (url.pathname === '/__test/mailbox') return send(res, 200, { code: mailbox.get(url.searchParams.get('email')) ?? null });
      if (url.pathname === '/__test/offline') {
        offline = body?.on === true;
        return send(res, 200, { offline });
      }
      if (url.pathname === '/__test/expire-otp') {
        const c = codes.get(body?.email);
        if (c) c.expiresAt = 0;
        return send(res, 200, {});
      }
      if (url.pathname === '/__test/stats') return send(res, 200, stats);
      if (offline) {
        req.socket.destroy(); // like a lost connection
        return;
      }
      const bearer = (req.headers.authorization ?? '').replace(/^Bearer /, '');
      if (verify(req.headers.apikey) === null) return send(res, 401, { message: 'Invalid API key' });

      // ---- Auth (GoTrue subset)
      if (url.pathname === '/auth/v1/otp' && req.method === 'POST') {
        stats.otpRequests += 1;
        const email = String(body?.email ?? '').trim().toLowerCase();
        if (!/^\S+@\S+\.\S+$/.test(email)) return authError(res, 400, 'validation_failed', 'Unable to validate email address: invalid format');
        const prev = codes.get(email);
        if (prev && Date.now() - prev.sentAt < otpResendSeconds * 1000) return authError(res, 429, 'over_email_send_rate_limit', `For security purposes, you can only request this after ${otpResendSeconds} seconds.`);
        const admin = await pool.connect();
        try {
          await admin.query('insert into auth.users (email) values ($1) on conflict (email) do nothing', [email]);
        } finally {
          admin.release();
        }
        const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
        codes.set(email, { code, expiresAt: Date.now() + otpTtlSeconds * 1000, attempts: 0, sentAt: Date.now() });
        mailbox.set(email, code);
        return send(res, 200, {});
      }
      if (url.pathname === '/auth/v1/verify' && req.method === 'POST') {
        const email = String(body?.email ?? '').trim().toLowerCase();
        const c = codes.get(email);
        if (!c || c.expiresAt < Date.now() || c.attempts >= 5 || c.code !== String(body?.token ?? '')) {
          if (c) c.attempts += 1;
          return authError(res, 403, 'otp_expired', 'Token has expired or is invalid');
        }
        codes.delete(email);
        const admin = await pool.connect();
        try {
          const u = (await admin.query('select id, email, created_at from auth.users where email = $1', [email])).rows[0];
          return send(res, 200, await session(u));
        } finally {
          admin.release();
        }
      }
      if (url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'refresh_token') {
        stats.refreshes += 1;
        const t = refreshTokens.get(body?.refresh_token);
        if (!t || t.revoked) return authError(res, 400, 'refresh_token_not_found', 'Invalid Refresh Token: Refresh Token Not Found');
        t.revoked = true; // rotation: a refresh token works once
        const admin = await pool.connect();
        try {
          const u = (await admin.query('select id, email, created_at from auth.users where id = $1', [t.userId])).rows[0];
          if (!u) return authError(res, 400, 'user_not_found', 'User from sub claim in JWT does not exist');
          return send(res, 200, await session(u));
        } finally {
          admin.release();
        }
      }
      if (url.pathname === '/auth/v1/logout') {
        const claims = verify(bearer);
        if (!claims?.sub) return authError(res, 401, 'no_authorization', 'invalid JWT');
        for (const t of refreshTokens.values()) if (t.userId === claims.sub) t.revoked = true;
        return send(res, 204);
      }
      if (url.pathname === '/auth/v1/user') {
        const claims = verify(bearer);
        if (!claims?.sub) return authError(res, 401, 'bad_jwt', 'invalid JWT');
        return send(res, 200, userJson({ id: claims.sub, email: claims.email, created_at: null }));
      }

      // ---- REST (PostgREST subset): RPC and reading the own profile
      const claims = bearer && bearer !== req.headers.apikey ? verify(bearer) : null;
      if (bearer && bearer !== req.headers.apikey && !claims) return send(res, 401, { code: 'PGRST301', message: 'JWT expired' });
      const rpc = /^\/rest\/v1\/rpc\/([a-z_]+)$/.exec(url.pathname);
      if (rpc && req.method === 'POST') {
        const fn = rpc[1];
        stats.rpc[fn] = (stats.rpc[fn] ?? 0) + 1;
        try {
          const out = await asRole(claims?.sub ? claims : null, async (c) => {
            const meta = (await c.query(
              "select p.proretset, t.typtype, format_type(p.prorettype, null) rt, p.proargnames names, array(select format_type(x, null) from unnest(p.proargtypes) x) types from pg_proc p join pg_type t on t.oid = p.prorettype where p.pronamespace = 'public'::regnamespace and p.proname = $1",
              [fn],
            )).rows[0];
            if (!meta) throw Object.assign(new Error(`Could not find the function public.${fn}`), { code: 'PGRST202' });
            const args = Object.entries(body ?? {});
            const params = args.map(([, v]) => (v !== null && typeof v === 'object' ? JSON.stringify(v) : v));
            const list = args.map(([k], i) => {
              const at = (meta.names ?? []).indexOf(k);
              if (at < 0) throw Object.assign(new Error(`unknown argument ${k}`), { code: 'PGRST202' });
              return `${k} => $${i + 1}::${meta.types[at]}`;
            });
            const call = `public.${fn}(${list.join(', ')})`;
            if (meta.proretset || meta.typtype === 'c') {
              const rows = (await c.query(`select * from ${call}`, params)).rows;
              return meta.proretset ? rows : (rows[0] ?? null);
            }
            const v = (await c.query(`select ${call} as v`, params)).rows[0]?.v;
            return meta.rt === 'void' ? undefined : v;
          });
          return out === undefined ? send(res, 204) : send(res, 200, out);
        } catch (e) {
          return pgError(res, e);
        }
      }
      if (url.pathname === '/rest/v1/profiles' && req.method === 'GET') {
        const cols = (url.searchParams.get('select') ?? '*').split(',').map((s) => s.trim()).filter((s) => /^[a-z_*]+$/.test(s));
        try {
          const rows = await asRole(claims?.sub ? claims : null, async (c) => (await c.query(`select ${cols.join(', ')} from public.profiles`)).rows);
          if ((req.headers.accept ?? '').includes('vnd.pgrst.object')) {
            if (rows.length !== 1) return send(res, 406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' });
            return send(res, 200, rows[0]);
          }
          return send(res, 200, rows);
        } catch (e) {
          return pgError(res, e);
        }
      }
      return send(res, 404, { message: `not emulated: ${req.method} ${url.pathname}` });
    } catch (e) {
      return send(res, 500, { message: String(e?.message ?? e) });
    }
  });
  await new Promise((r) => server.listen(port, '127.0.0.1', r));
  const address = server.address();
  return {
    url: `http://127.0.0.1:${address.port}`,
    anonKey,
    stats,
    mailbox: (email) => mailbox.get(email.toLowerCase()) ?? null,
    expireOtp: (email) => {
      const c = codes.get(email.toLowerCase());
      if (c) c.expiresAt = 0;
    },
    setOffline: (on) => {
      offline = on;
    },
    deleteUser: async (id) => {
      const c = await pool.connect();
      try {
        await c.query('delete from auth.users where id = $1', [id]);
      } finally {
        c.release();
      }
    },
    query: async (sql, params) => {
      const c = await pool.connect();
      try {
        return (await c.query(sql, params)).rows;
      } finally {
        c.release();
      }
    },
    close: async () => {
      await new Promise((r) => server.close(r));
      server.closeAllConnections?.();
      await pool.end();
    },
  };
}

// CLI: node scripts/gateway/local-supabase.mjs → prints URL and anon key (for the browser rehearsal).
if (import.meta.url === `file://${process.argv[1]}`) {
  const admin = process.env.DATABASE_URL ?? 'postgres://postgres@localhost:54329/postgres?host=/tmp';
  const db = await prepareDatabase(admin);
  const gw = await startGateway({ databaseUrl: db, port: Number(process.env.GATEWAY_PORT ?? 54321) });
  console.log(JSON.stringify({ url: gw.url, anonKey: gw.anonKey }));
}
