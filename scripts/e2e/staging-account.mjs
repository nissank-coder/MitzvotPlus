// Round 12.5 – browser rehearsal of a STAGING build: the real bundle (with its CSP) talks to the
// local Supabase stand-in (scripts/gateway) over a real PostgreSQL. Synthetic accounts only.
// Proves: the CSP of a staging build allows exactly its backend; sign-in with an e-mail code from
// the UI; guest data moves to an account only when confirmed; sign-out returns to the guest's own
// data; consent and account deletion reach the server. Any failed check or console error → exit 1.
//   DATABASE_URL=… node scripts/e2e/staging-account.mjs
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import { chromium } from 'playwright';
import { prepareDatabase, startGateway } from '../gateway/local-supabase.mjs';

const require = createRequire(import.meta.url);
const ts = require('typescript');
require.extensions['.ts'] = (m, f) =>
  m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), { compilerOptions: { module: 1, target: 9, esModuleInterop: true } }).outputText, f);
const { createFreshState, reducer } = require('../../src/store/state.ts');

const ADMIN = process.env.DATABASE_URL ?? 'postgres://postgres@localhost:54329/postgres?host=/tmp';
const PORT = 4175;
const OUT = 'dist-staging';
const failures = [];
const passed = [];
const check = (cond, name, detail = '') => (cond ? passed.push(name) : failures.push(`${name}${detail ? ` – ${detail}` : ''}`));

const gw = await startGateway({ databaseUrl: await prepareDatabase(ADMIN, 'mitzvot_e2e_staging'), port: 54321, otpResendSeconds: 1 });
const build = spawnSync('npx', ['vite', 'build', '--outDir', OUT, '--emptyOutDir'], {
  env: { ...process.env, VITE_BACKEND_ENV: 'staging', VITE_SUPABASE_URL: gw.url, VITE_SUPABASE_ANON_KEY: gw.anonKey, MITZVOT_LOCAL_STAGING: '1' },
  encoding: 'utf8',
});
if (build.status !== 0) {
  console.log(build.stdout, build.stderr);
  process.exit(1);
}
const html = fs.readFileSync(`${OUT}/index.html`, 'utf8');
const connect = /connect-src ([^;"]*)/.exec(html)?.[1];
check(connect === `'self' https://www.sefaria.org ${gw.url}`, 'CSP: the staging build may connect to exactly its backend', connect);

const preview = spawn('npx', ['vite', 'preview', '--outDir', OUT, '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
const url = `http://localhost:${PORT}`;
for (let i = 0; i < 80; i += 1) {
  try {
    if ((await fetch(url)).ok) break;
  } catch {}
  await new Promise((r) => setTimeout(r, 250));
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Jerusalem', locale: 'he-IL' });
const p = await ctx.newPage();
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
// A refused wrong code is an expected 403 from the auth server; everything else is an error.
p.on('console', (m) => m.type() === 'error' && !/status of 403/.test(m.text()) && errors.push(m.text()));
const settle = () => p.waitForTimeout(800);
const text = async () => (await p.locator('body').innerText()).replace(/\s+/g, ' ');
const tab = (label) => p.locator('nav button', { hasText: label }).click();
const ls = () => p.evaluate(() => Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)])));
const signIn = async (email, wrongFirst = false) => {
  await p.fill('#acct-email', email);
  await p.click('text=שליחת קוד התחברות');
  await p.waitForSelector('#acct-code');
  if (wrongFirst) {
    await p.fill('#acct-code', gw.mailbox(email) === '000000' ? '111111' : '000000');
    await p.click('button:has-text("התחברות")');
    await settle();
    check((await text()).includes('הקוד שגוי או שפג תוקפו'), 'a wrong code: a clear message in Hebrew');
  }
  await p.fill('#acct-code', gw.mailbox(email));
  await p.click('button:has-text("התחברות")');
  await settle();
};
const toAccountSection = async () => {
  await tab('אני');
  await settle();
  await p.locator('[data-testid=account-section]').scrollIntoViewIfNeeded();
};

let guest = reducer(createFreshState(Date.now()), { type: 'completeOnboarding', payload: { userName: 'אורח בודק', dailyGoal: 5, profile: {}, dateKey: '2026-11-24', habits: [] } });
guest = reducer(guest, { type: 'addAction', payload: { key: 'chesed', now: Date.now() } });
guest = reducer(guest, { type: 'addAction', payload: { key: 'shacharit', now: Date.now() + 1 } });

try {
  await p.goto(url);
  await p.evaluate((s) => {
    localStorage.clear();
    localStorage.setItem('mitzvot_plus_state_v1', JSON.stringify(s));
  }, guest);
  await p.reload();
  await settle();
  await toAccountSection();
  check((await text()).includes('שרת בדיקות (staging) – לא ייצור'), 'staging build: the account section says it is not production');

  // 1. Sign in, and keep the guest's data as the guest's: the account starts empty.
  await signIn('keep-guest@test.invalid', true);
  check((await text()).includes('במכשיר יש 2 רישומים שנעשו כאורח'), '1: after sign-in the app asks before moving the guest\'s 2 entries');
  await p.click('text=להשאיר כאורח');
  await settle();
  let store = await ls();
  check(store.mitzvot_plus_active_space?.startsWith('user:'), '1: the account\'s own data space is active');
  check(JSON.parse(store.mitzvot_plus_state_v1).logs.length === 2, '1: the guest\'s entries stay the guest\'s');
  check(await p.locator('#onboarding-name').isVisible(), '1: the account starts with its own, empty data (onboarding)');
  await p.fill('#onboarding-name', 'חשבון א');
  await p.click('text=המשך');
  await p.locator('button[aria-pressed]').first().click();
  await p.click('text=/המשך \\(1 נבחרו\\)/');
  await p.click('text=מתחילים');
  await settle();

  // 2. Sign out → the guest's own data is back; the account's data stays on the device, hidden.
  await toAccountSection();
  await p.click('button:has-text("התנתקות") >> nth=0');
  await p.locator('[role=dialog] button', { hasText: 'התנתקות' }).click();
  await settle();
  store = await ls();
  check(store.mitzvot_plus_active_space === 'guest', '2: after sign-out the guest\'s data is shown');
  check((await text()).includes('אורח בודק') || (await (async () => { await tab('אני'); await settle(); return (await text()).includes('אורח בודק'); })()), '2: the guest\'s name is back on screen');
  check(Object.keys(store).some((k) => k.startsWith('mitzvot_plus_state_v1@user:') && JSON.parse(store[k]).userName === 'חשבון א'), '2: the account\'s data is kept separately on the device');
  check(!Object.values(store).some((v) => v?.includes('access_token')), '2: no session token in the browser storage');

  if (process.env.DEBUG_E2E) console.log('SECTION:', await p.locator('[data-testid=account-section]').innerText().catch(() => 'none'));
  // 3. A second account takes the guest's data – only because the user confirms it.
  await toAccountSection();
  await signIn('take-guest@test.invalid');
  await p.click('[role=dialog] button:has-text("העברה לחשבון")');
  await settle();
  store = await ls();
  const second = Object.entries(store).find(([k, v]) => k.startsWith('mitzvot_plus_state_v1@user:') && v.includes('אורח בודק'));
  check(second && JSON.parse(second[1]).logs.length === 2, '3: the confirmed transfer moved both entries to the account');
  check(!store.mitzvot_plus_state_v1, '3: and the guest has nothing left');
  check(!Object.entries(store).some(([k, v]) => k.startsWith('mitzvot_plus_state_v1@user:') && v.includes('חשבון א') && v.includes('אורח בודק')), '3: nothing of account A reached account B');

  // 4. Consent and account deletion reach the server.
  await toAccountSection();
  await p.locator('label:has-text("גיבוי בענן") input').click();
  await settle();
  const uid = second[0].split('@user:')[1];
  check((await gw.query('select consent_cloud_backup from public.profiles where user_id = $1', [uid]))[0]?.consent_cloud_backup === true, '4: turning backup on is recorded on the server');
  await p.locator('[data-testid=account-section] button', { hasText: 'מחיקת החשבון' }).click();
  await p.locator('[role=dialog] button', { hasText: 'מחיקת החשבון' }).click();
  await settle();
  check((await gw.query('select count(*)::int n from auth.users where id = $1', [uid]))[0].n === 0, '4: deleting the account removes it on the server');
  store = await ls();
  check(!Object.keys(store).includes(`mitzvot_plus_state_v1@user:${uid}`), '4: and the account\'s data on this device');
  check(store.mitzvot_plus_active_space === 'guest', '4: the app is back to a guest');
  check(!errors.some((e) => /Content Security Policy|Refused to connect/.test(e)), 'CSP: no request was blocked', errors.join(' | '));
} catch (e) {
  failures.push(`exception: ${e.message}`);
} finally {
  check(errors.length === 0, 'no console errors', errors.join(' | '));
  await browser.close();
  preview.kill();
  await gw.close();
  fs.rmSync(OUT, { recursive: true, force: true });
}

console.log(`Staging rehearsal: ${passed.length} passed, ${failures.length} failed`);
for (const n of passed) console.log(`  PASS ${n}`);
for (const f of failures) console.log(`  FAIL ${f}`);
process.exit(failures.length === 0 ? 0 : 1);
