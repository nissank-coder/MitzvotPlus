// Design round 1.1 – reproductions of the bugs found in the review of round 1, and the partial-progress
// feedback. Written BEFORE the fixes: on the round-1 code (main 4f6f69b) these checks fail; after the
// fixes they pass. Runs on a PRODUCTION build (default) – one check needs Dvar Torah content and
// runs on an internal build (--with-demo, the marked TEST_ONLY placeholder).
//   node scripts/e2e/round-1-1.mjs [--with-demo]
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import { chromium } from 'playwright';

const require = createRequire(import.meta.url);
const ts = require('typescript');
require.extensions['.ts'] = (m, f) =>
  m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), { compilerOptions: { module: 1, target: 9, esModuleInterop: true } }).outputText, f);
const { createFreshState, reducer } = require('../../src/store/state.ts');

const WITH_DEMO = process.argv.includes('--with-demo');
const failures = [];
const passed = [];
const check = (cond, name, detail = '') => (cond ? passed.push(name) : failures.push(`${name}${detail ? ` – ${detail}` : ''}`));

async function serve(outDir, env, port) {
  const b = spawnSync('npx', ['vite', 'build', '--outDir', outDir, '--emptyOutDir'], { env: { ...process.env, ...env }, encoding: 'utf8' });
  if (b.status !== 0) throw new Error(b.stderr);
  const proc = spawn('npx', ['vite', 'preview', '--outDir', outDir, '--port', String(port), '--strictPort'], { stdio: 'ignore', detached: true });
  const url = `http://localhost:${port}`;
  for (let i = 0; i < 80; i += 1) {
    try {
      if ((await fetch(url)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  // Own process group: stopping it stops vite too (a leftover server would serve a deleted build).
  const stop = () => {
    try {
      process.kill(-proc.pid);
    } catch {}
    fs.rmSync(outDir, { recursive: true, force: true });
  };
  return { url, stop };
}

const iso = (d, h, m = 0) => new Date(`${d}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+02:00`).getTime();
const onboarded = (now, habits = [{ id: 'three-prayers', perWeek: 7 }, { id: 'learn-daily', perWeek: 7 }]) =>
  reducer(createFreshState(now - 10 * 86400000), {
    type: 'completeOnboarding',
    payload: { userName: 'בודק', dailyGoal: 5, profile: { gender: 'male', cityId: 'jerusalem' }, dateKey: '2026-11-15', habits },
  });
const add = (s, key, when, dateKey, extra = {}) => reducer(s, { type: 'addAction', payload: { key, now: when, dateKey, ...extra } });

async function page(browser, url, now, state) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Jerusalem', locale: 'he-IL' });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.addInitScript({ path: 'scripts/e2e/fakedate.js' });
  await p.goto(url);
  await p.evaluate(([n, s]) => {
    localStorage.clear();
    localStorage.setItem('__fakeNow', String(n));
    localStorage.setItem('mitzvot_plus_state_v1', JSON.stringify(s));
  }, [now, state]);
  await p.reload();
  await p.waitForTimeout(700);
  return { p, ctx, errors };
}
const stored = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('mitzvot_plus_state_v1')));
const toastText = async (p) => (await p.locator('[role=status]').filter({ has: p.locator('button[aria-label="סגירה"]') }).first().innerText({ timeout: 3000 }).catch(() => '')).replace(/\s+/g, ' ');

const browser = await chromium.launch();
const prod = await serve('dist-r11', {}, 4177);
try {
  // R1 – after-the-fact entries (Shabbat) must not make the toast name / undo another entry of today.
  {
    const NOW = iso('2026-11-29', 10); // Sunday after Shabbat 28.11
    let s = onboarded(NOW);
    s = add(s, 'shacharit', iso('2026-11-29', 8), '2026-11-29');
    const { p, ctx } = await page(browser, prod.url, NOW, s);
    await p.click('text=/שבוע טוב/');
    const small = await p.evaluate(() =>
      [...document.querySelectorAll('[role=dialog][aria-label="רישום שבת"] button')]
        .filter((b) => { const r = b.getBoundingClientRect(); return r.height > 0 && (r.height < 44 || r.width < 44); })
        .map((b) => b.getAttribute('aria-label') || b.textContent?.trim()),
    );
    check(small.length === 0, 'R5: every control of the Shabbat sheet (opened from Home) is at least 44px', small.slice(0, 6).join(', '));
    await p.locator('[role=dialog][aria-label="רישום שבת"] [role=checkbox]').first().click();
    await p.locator('[role=dialog][aria-label="רישום שבת"] button', { hasText: 'שמירה' }).click();
    await p.waitForTimeout(900);
    const t = await toastText(p);
    check(!t.includes('שחרית'), 'R1: the toast after a Shabbat entry does not name an unrelated entry of today', t);
    await p.locator('[role=status] button[aria-label^="ביטול"]').first().click({ timeout: 2000 }).catch(() => {});
    await p.waitForTimeout(600);
    const after = await stored(p);
    check(after.logs.some((l) => l.actionKey === 'shacharit' && l.dateKey === '2026-11-29'), 'R1: "ביטול" never removes an entry other than the one just recorded');
    await ctx.close();
  }

  // R2 – the "goal reached" message on the blessings screen must go away by itself.
  {
    const NOW = iso('2026-11-24', 18);
    let s = onboarded(NOW);
    for (let i = 0; i < 99; i += 1) s = reducer(s, { type: 'addAction', payload: { key: 'blessing', category: 'other', now: iso('2026-11-24', 7) + i * 60000, dateKey: '2026-11-24' } });
    const { p, ctx } = await page(browser, prod.url, NOW, s);
    await p.click('[aria-label^="100 ברכות"]');
    await p.waitForTimeout(400);
    await p.locator('main [aria-label^="+ ברכה"]').first().click();
    await p.waitForTimeout(1200);
    const shownAtFirst = await p.locator('text=השלמת את היעד היומי').count();
    check(shownAtFirst === 1, 'R2: reaching the goal on the blessings screen shows the message', String(shownAtFirst));
    await p.waitForTimeout(7500);
    check((await p.locator('text=השלמת את היעד היומי').count()) === 0, 'R2: the message disappears by itself (no permanent banner)');
    await ctx.close();
  }

  // R3 – reaching the blessing goal from Home (or the add sheet) gives the same feedback.
  {
    const NOW = iso('2026-11-24', 18);
    let s = onboarded(NOW);
    for (let i = 0; i < 99; i += 1) s = reducer(s, { type: 'addAction', payload: { key: 'blessing', category: 'other', now: iso('2026-11-24', 7) + i * 60000, dateKey: '2026-11-24' } });
    const { p, ctx } = await page(browser, prod.url, NOW, s);
    await p.locator('[aria-label^="+ ברכה"]').first().click();
    await p.waitForTimeout(900);
    const t = await toastText(p);
    check(/יעד הברכות/.test(t), 'R3: the 100th blessing from Home announces the goal', t);
    await ctx.close();
  }

  // P1 – partial progress: one prayer of "three prayers" says how far the habit is.
  {
    const NOW = iso('2026-11-24', 18);
    const { p, ctx } = await page(browser, prod.url, NOW, onboarded(NOW));
    await p.click('[aria-label="רישום תפילה: שלוש תפילות"]');
    await p.locator('[role=dialog] button', { hasText: 'מנחה' }).click();
  await p.locator('[role=dialog] button', { hasText: 'מנחה ביחידות' }).click(); // round 13 (U5): the minyan choice
    await p.waitForTimeout(900);
    const t = await toastText(p);
    check(/שלוש תפילות: 1 מתוך 3/.test(t), 'P1: the toast reports partial progress of the habit', t);
    check((await p.locator('[aria-label="שלוש תפילות: 1 מתוך 3"]').count()) === 1, 'P1: the habit row shows its partial progress (1 of 3)');
    await ctx.close();
  }

  // R4 – Home: the Dvar Torah tile is "done" only after the Dvar Torah itself was recorded.
  if (WITH_DEMO) {
    const demo = await serve('dist-r11-demo', { VITE_DEMO_CONTENT: 'true' }, 4178);
    const NOW = iso('2026-11-24', 18);
    let s = onboarded(NOW);
    s = add(s, 'torahStudy', iso('2026-11-24', 16), '2026-11-24');
    const { p, ctx } = await page(browser, demo.url, NOW, s);
    const label = await p.locator('[aria-label^="דבר תורה:"]').first().getAttribute('aria-label');
    check(label === 'דבר תורה: לקריאה', 'R4: general learning does not mark the Dvar Torah as read', String(label));
    await ctx.close();
    demo.stop();
  }
} catch (e) {
  failures.push(`exception: ${e.message.split('\n')[0]}`);
} finally {
  await browser.close();
  prod.stop();
}

console.log(`Round 1.1: ${passed.length} passed, ${failures.length} failed`);
for (const n of passed) console.log(`  PASS ${n}`);
for (const f of failures) console.log(`  FAIL ${f}`);
process.exit(failures.length === 0 ? 0 : 1);
