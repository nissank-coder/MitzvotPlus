// "לומדים יחד" – a recorded demo of two people against the HOSTED staging project, in the app's
// web staging build (Chromium 390×844 ×2 – not phones): sign in with a test account, agree to share,
// invite, join with the terms, read (nothing recorded), record "למדתי", the partner sees it, cheer,
// undo (the partner sees it go), the result after the challenge closes, another round offered.
// Each step is checked; a frame of both screens is kept; the two recordings become one video.
//   STAGING_SUPABASE_URL=… STAGING_PUBLISHABLE_KEY=… STAGING_TESTERS=<json outside the repo> \
//   NODE_USE_ENV_PROXY=1 node scripts/demo/together-demo.mjs [--out docs/learning-together/demo]
// The challenge's dates are moved back on the server (Management API, synthetic accounts only) to
// show the end of a 7-day challenge in minutes – said in the video's step log.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => (a.startsWith('--') ? [a.slice(2), all[i + 1]] : [])).filter((x) => x.length));
const OUT = args.out ?? 'docs/learning-together/demo';
fs.mkdirSync(OUT, { recursive: true });
const URL_ = process.env.STAGING_SUPABASE_URL;
const KEY = process.env.STAGING_PUBLISHABLE_KEY;
const all = JSON.parse(fs.readFileSync(process.env.STAGING_TESTERS, 'utf8'));
// DEMO_PAIR=d,e: two accounts that exist only for the video (a clean history).
const [pa, pb] = (process.env.DEMO_PAIR ?? 'a,b').split(',');
const testers = { a: all[pa], b: all[pb] };
const REF = new URL(URL_).hostname.split('.')[0];
const commit = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
const DIST = 'dist-together';

// 1. Start from a clean slate for the two synthetic accounts: no open challenge, sharing off.
for (const who of ['a', 'b']) {
  const sb = createClient(URL_, KEY, { auth: { persistSession: false } });
  await sb.auth.signInWithPassword({ email: testers[who].email, password: testers[who].password });
  const mine = (await sb.rpc('my_together')).data;
  for (const c of mine?.challenges ?? []) await sb.rpc('leave_together', { p_challenge: c.id });
  await sb.rpc('set_consent', { p_cloud_backup: false, p_social: false, p_delete_cloud_data: false });
}

// 2. The web staging build.
const env = { ...process.env, VITE_BUILD_COMMIT: commit, VITE_BACKEND_ENV: 'staging', VITE_SUPABASE_URL: URL_, VITE_SUPABASE_PUBLISHABLE_KEY: KEY, VITE_SOCIAL: 'true', VITE_AUTH_PASSWORD: 'true', VITE_WEB_SQLITE: 'true' };
const b = spawnSync('npx', ['vite', 'build', '--outDir', DIST, '--emptyOutDir'], { env, encoding: 'utf8' });
if (b.status !== 0) throw new Error(b.stderr);
const preview = spawn('npx', ['vite', 'preview', '--outDir', DIST, '--port', '4190', '--strictPort'], { stdio: 'ignore', detached: true });
const APP = 'http://localhost:4190';
for (let i = 0; i < 80; i += 1) {
  try {
    if ((await fetch(APP)).ok) break;
  } catch {}
  await new Promise((r) => setTimeout(r, 250));
}

const steps = [];
const failures = [];
const browser = await chromium.launch({ proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } : undefined });
const mk = async (name) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, ignoreHTTPSErrors: true, timezoneId: 'Asia/Jerusalem', locale: 'he-IL', recordVideo: { dir: path.join(OUT, `raw-${name}`), size: { width: 390, height: 844 } } });
  const p = await ctx.newPage();
  p.setDefaultTimeout(20000);
  await p.goto(APP);
  return { ctx, p, name };
};
const A = await mk('a');
const B = await mk('b');
const pause = (ms = 900) => new Promise((r) => setTimeout(r, ms));
async function frame(label) {
  const n = String(steps.length + 1).padStart(2, '0');
  for (const u of [A, B]) await u.p.screenshot({ path: path.join(OUT, `${n}-${u.name}.jpg`), type: 'jpeg', quality: 75 });
  return n;
}
async function step(label, fn, check) {
  let ok = false;
  let detail;
  try {
    await fn();
    await pause();
    ok = Boolean(await check());
  } catch (e) {
    detail = e.message.split('\n')[0];
  }
  const n = await frame(label);
  steps.push({ step: label, ok, frame: n, ...(detail ? { detail } : {}) });
  if (!ok) failures.push(`${label}${detail ? ` – ${detail}` : ''}`);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${detail ? ` – ${detail}` : ''}`);
}
const visible = (u, sel) => u.p.locator(sel).first().isVisible().catch(() => false);

async function onboard(u, name) {
  await u.p.locator('#onboarding-name, [aria-label="אני"]').first().waitFor({ timeout: 30000 });
  if (!(await visible(u, '#onboarding-name'))) return;
  await u.p.fill('#onboarding-name', name);
  await u.p.click('text=המשך');
  await u.p.locator('button[aria-pressed]', { hasText: 'לימוד יומי' }).first().click();
  await u.p.click('text=/המשך \\(1 נבחרו\\)/');
  await u.p.click('text=מתחילים');
  await pause(600);
}
async function signIn(u, who) {
  await u.p.click('[aria-label="אני"]');
  const box = u.p.locator('[data-testid="password-signin"]');
  await box.scrollIntoViewIfNeeded();
  await u.p.fill('input[aria-label="דוא״ל חשבון בדיקה"]', testers[who].email);
  await u.p.fill('input[aria-label="סיסמת חשבון בדיקה"]', testers[who].password);
  await u.p.click('text=כניסה לחשבון בדיקה');
  // A new account has its own, empty data space on this device: the app asks for the short onboarding again.
  const asked = await u.p.locator('#onboarding-name').waitFor({ timeout: 20000 }).then(() => true, () => false);
  if (asked) await onboard(u, who === 'a' ? 'אבי' : 'בתיה');
}
async function openTogether(u) {
  await u.p.click('[aria-label="מסלולים"]');
  await u.p.click('[data-testid="together-entry"]');
  await pause(1500);
}
async function consent(u, name) {
  await u.p.locator('[data-testid="together-name"]').fill(name);
  await u.p.click('text=מסכים ומשתתף');
  await pause(2500);
}

try {
  await step('both open the app (two separate browsers) and finish the short onboarding', async () => {
    await onboard(A, 'אבי');
    await onboard(B, 'בתיה');
  }, async () => (await visible(A, '[aria-label="אני"]')) && (await visible(B, '[aria-label="אני"]')));
  await step('both sign in with their own test account (hosted staging)', async () => {
    await signIn(A, 'a');
    await signIn(B, 'b');
  }, async () => (await A.p.locator('text=כניסה לחשבון בדיקה').count()) === 0 && (await B.p.locator('text=כניסה לחשבון בדיקה').count()) === 0);
  await step('A opens "לומדים יחד": what the partner will see, what not, backup from now', () => openTogether(A), async () => (await A.p.locator('text=מה החבר יראה').count()) === 1);
  await step('A agrees and shares (display name, backup only from now)', () => consent(A, 'אבי'), async () => (await A.p.locator('text=הזמנת חבר לאתגר').count()) === 1);
  let code = '';
  await step('A invites: a single-use code', async () => {
    await A.p.click('text=הזמנת חבר לאתגר');
    code = (await A.p.locator('[data-testid="together-code"]').innerText()).trim();
  }, async () => /^[A-HJ-NP-Z2-9]{8}$/.test(code));
  await step('B opens "לומדים יחד" and agrees to share', async () => {
    await openTogether(B);
    await consent(B, 'בתיה');
  }, async () => (await B.p.locator('text=קיבלתי קוד').count()) === 1);
  await step('B types the code: who invites, the metric, the period, the comparison – before joining', async () => {
    await B.p.click('text=קיבלתי קוד');
    await B.p.locator('[data-testid="together-code-input"]').fill(code);
    await B.p.click('button:has-text("המשך")');
  }, async () => /אבי/.test(await B.p.locator('[aria-label="תנאי האתגר"]').innerText()) && (await B.p.locator('[data-testid="together-terms"] li').count()) === 4);
  await step('B agrees to the terms and joins', async () => {
    await B.p.click('[data-testid="together-agree"]');
    await B.p.click('text=הצטרפות לאתגר');
    await pause(2500);
  }, async () => (await B.p.locator('[data-testid="together-partner"]').innerText()).includes('אבי'));
  await step('A sees B in the challenge (0 of 3 each)', async () => {
    await A.p.click('button[aria-label="חזרה"]'); // back to the hub
    await pause(1500);
    await A.p.locator('[data-testid="together-card"]').first().click();
    await pause(3000);
  }, async () => (await A.p.locator('[data-testid="together-partner"]').innerText()).includes('בתיה'));
  await step('A reads today\'s halacha in the app – reading records nothing', async () => {
    await A.p.click('text=ללימוד היום');
    await pause(1500);
    if (await visible(A, '[aria-label="הוספת מסלול: הלכה יומית"]')) await A.p.click('[aria-label="הוספת מסלול: הלכה יומית"]');
    await A.p.click('[aria-label="קריאה: הלכה יומית"]');
    await A.p.locator('.reader-text').first().waitFor({ timeout: 30000 });
    await A.p.locator('.reader-text').nth(3).scrollIntoViewIfNeeded().catch(() => undefined);
    await pause(1200);
  }, async () => (await A.p.locator('.reader-text').count()) > 0);
  await step('A records "למדתי" on purpose – the message names it, with undo', async () => {
    await A.p.locator('[role=dialog] button[aria-label^="למדתי – רישום"]').click();
    await pause(1200);
  }, async () => /נרשם/.test(await A.p.locator('[role=status]').first().innerText().catch(() => '')));
  await step('B refreshes: A at 1 of 3 (sent from A\'s SQLite, confirmed by the server)', async () => {
    await pause(6000); // A's automatic send after recording
    await B.p.click('text=רענון ההתקדמות');
    await pause(3500);
  }, async () => /1\s*מתוך\s*3/.test(await B.p.locator('[data-testid="together-partner"]').innerText()));
  await step('B cheers A (יישר כוח) – once a day', async () => {
    await B.p.click('button[aria-label^="יישר כוח"]');
    await pause(2500);
  }, async () => (await B.p.locator('text=שלחת יישר כוח היום').count()) >= 1);
  await step('A undoes the entry from Home; B sees A back at 0', async () => {
    await A.p.locator('[role=dialog] button[aria-label="סגירה"]').first().click(); // the reader stays open after "למדתי"
    await pause(600);
    await A.p.click('[aria-label="היום"]');
    await pause(1000);
    await A.p.locator('button[aria-label^="ביטול: "]').first().click();
    await A.p.locator('[role=dialog] button', { hasText: 'הסרה' }).first().click();
    await pause(6500);
    await B.p.click('text=רענון ההתקדמות');
    await pause(3500);
  }, async () => /0\s*מתוך\s*3/.test(await B.p.locator('[data-testid="together-partner"]').innerText()));
  await step('A records again, sees the cheer from B', async () => {
    await A.p.click('[aria-label="מסלולים"]');
    await A.p.click('[data-testid="together-entry"]');
    await pause(2000);
    await A.p.locator('[data-testid="together-card"]').first().click();
    await pause(2000);
    await A.p.click('text=ללימוד היום');
    await pause(1200);
    await A.p.locator('button[aria-label="למדתי: הלכה יומית"]').click();
    await pause(6000);
    await A.p.click('[aria-label="מסלולים"]');
    await A.p.click('[data-testid="together-entry"]');
    await pause(2000);
    await A.p.locator('[data-testid="together-card"]').first().click();
    await pause(3500);
  }, async () => /קיבלת 1 יישר כוח/.test(await A.p.locator('[data-testid="together-me"]').innerText()));

  // The end of the 7 days, in minutes: the challenge's dates are moved back on the server (synthetic accounts).
  const sbA = createClient(URL_, KEY, { auth: { persistSession: false } });
  await sbA.auth.signInWithPassword({ email: testers.a.email, password: testers.a.password });
  const active = (await sbA.rpc('my_together')).data.challenges.find((c) => c.state === 'active');
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: 'Bearer proxy-injected', 'content-type': 'application/json' },
    body: JSON.stringify({ query: `update public.together_challenges set start_date = start_date - 8, end_date = end_date - 8 where id = '${active.id}';` }),
  });
  steps.push({ step: `(demo) the challenge's dates moved back 8 days on the server: ${r.status}`, ok: r.ok, frame: null });
  await step('after it closes: the result by the agreed rule, the goal, and another round', async () => {
    await A.p.click('text=רענון ההתקדמות').catch(() => undefined);
    await pause(3500);
  }, async () => /האתגר הסתיים/.test(await A.p.locator('[data-testid="together-hero"]').innerText()) && (await A.p.locator('text=/סיבוב נוסף/').count()) === 1);
} finally {
  const vids = [await A.p.video()?.path(), await B.p.video()?.path()];
  await A.ctx.close();
  await B.ctx.close();
  await browser.close();
  try {
    process.kill(-preview.pid);
  } catch {}
  fs.rmSync(DIST, { recursive: true, force: true });
  // Side by side: A on the right (RTL), B on the left.
  if (vids[0] && vids[1]) {
    const f = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', vids[1], '-i', vids[0], '-filter_complex', 'hstack=inputs=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path.join(OUT, 'together-two-users.mp4')]);
    if (f.status !== 0) console.error(String(f.stderr));
  }
  for (const d of ['raw-a', 'raw-b']) fs.rmSync(path.join(OUT, d), { recursive: true, force: true });
  fs.writeFileSync(path.join(OUT, 'demo.json'), JSON.stringify({ target: `hosted Supabase staging (${REF})`, build: 'web staging build (VITE_SOCIAL, VITE_WEB_SQLITE, VITE_AUTH_PASSWORD) – Chromium 390×844 ×2, not phones', commit, steps }, null, 2));
  console.log(`Demo: ${steps.filter((s) => s.ok).length}/${steps.length} steps as expected${failures.length ? ` – FAIL ${failures.join(' | ')}` : ''}`);
  process.exit(failures.length ? 1 : 0);
}
