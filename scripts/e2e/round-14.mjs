// Round 14 (review v4) – in the real app, on a PRODUCTION build:
//   E existing user (state saved by the app of main b0c7e22): habits, weekly habits, blessing goal
//     and history kept; the editor saves nothing it did not change; the old default tracks are
//     shown as suggested, kept only when the user says so;
//   N clean install to the first entry and its undo;
//   L the learning reader: a 429 answered by a retry; a failure with its reason; the whole text;
//     opening records nothing, "למדתי" records; read once → readable without a network;
//     a new user is offered tracks, none is chosen for them;
//   Q the add sheet opened for one prayer never shows the whole list first.
// Sefaria is replaced by a local route (deterministic answers); the real answers are in
// docs/review-r14/evidence/learning-fetch.json.
//   node scripts/e2e/round-14.mjs
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import { chromium } from 'playwright';

const require = createRequire(import.meta.url);
const ts = require('typescript');
require.extensions['.ts'] = (m, f) =>
  m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), { compilerOptions: { module: 1, target: 9, esModuleInterop: true } }).outputText, f);
const { createFreshState, reducer } = require('../../src/store/state.ts');

const failures = [];
const passed = [];
const check = (cond, name, detail = '') => (cond ? passed.push(name) : failures.push(`${name}${detail ? ` – ${detail}` : ''}`));

const OUT = 'dist-r14';
const b = spawnSync('npx', ['vite', 'build', '--outDir', OUT, '--emptyOutDir'], { encoding: 'utf8' });
if (b.status !== 0) throw new Error(b.stderr);
const proc = spawn('npx', ['vite', 'preview', '--outDir', OUT, '--port', '4181', '--strictPort'], { stdio: 'ignore', detached: true });
const URL = 'http://localhost:4181';
for (let i = 0; i < 80; i += 1) {
  try {
    if ((await fetch(URL)).ok) break;
  } catch {}
  await new Promise((r) => setTimeout(r, 250));
}

const NOW = new Date('2026-11-26T20:00:00+02:00').getTime(); // Kitzur Shulchan Arukh, siman 10
const onboarded = (habits = [{ id: 'learn-daily', perWeek: 7 }]) =>
  reducer(createFreshState(NOW - 6 * 86400000), {
    type: 'completeOnboarding',
    payload: { userName: 'בודק', dailyGoal: 5, profile: { gender: 'male', cityId: 'jerusalem' }, dateKey: '2026-11-20', habits },
  });
const segments = (n) => ({ he: Array.from({ length: n }, (_, i) => `סעיף ${i + 1} של הלכות תפילין`), heRef: 'קיצור שולחן ערוך י', heVersionTitle: 'Torat Emet 357', heLicense: 'Public Domain' });

const browser = await chromium.launch();
async function open(state, { sefaria } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Jerusalem', locale: 'he-IL' });
  const p = await ctx.newPage();
  p.setDefaultTimeout(8000);
  const calls = [];
  await ctx.route('https://www.sefaria.org/api/texts/**', async (route) => {
    calls.push(route.request().url());
    const a = sefaria ? sefaria(calls.length) : { status: 200, body: segments(26) };
    if (a === 'abort') return route.abort('internetdisconnected');
    await route.fulfill({ status: a.status, contentType: a.raw ? 'text/html' : 'application/json', body: a.raw ?? JSON.stringify(a.body), headers: { 'access-control-allow-origin': '*' } });
  });
  await p.addInitScript({ path: 'scripts/e2e/fakedate.js' });
  await p.goto(URL);
  await p.evaluate(([n, s]) => {
    localStorage.clear();
    localStorage.setItem('__fakeNow', String(n));
    if (s) localStorage.setItem('mitzvot_plus_state_v1', JSON.stringify(s));
  }, [NOW, state ?? null]);
  await p.reload();
  await p.waitForTimeout(700);
  return { p, ctx, calls };
}
const stored = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('mitzvot_plus_state_v1')));
async function block(fn) {
  try {
    await fn();
  } catch (e) {
    failures.push(`exception: ${e.message.split('\n')[0]}`);
  }
}
const openReader = async (p) => {
  await p.click('[aria-label^="לימוד יומי"]');
  await p.click('[aria-label="קריאה: הלכה יומית"]');
};

try {
  // E – an existing user of the previous app.
  await block(async () => {
    const before = JSON.parse(fs.readFileSync('scripts/e2e/fixtures/existing-user-main-b0c7e22.json', 'utf8'));
    const { p, ctx } = await open(before);
    check((await p.locator('[aria-label="ההרגלים שלי"]').innerText()).includes('הכרת הטוב'), 'E: the weekly habit is still there');
    check((await p.locator('[aria-label^="100 ברכות"]').getAttribute('aria-label'))?.includes('מתוך 50'), 'E: the blessing goal (50) is kept');
    await p.locator('[aria-label="ההרגלים שלי"] button', { hasText: 'שינוי' }).click();
    check((await p.locator('[role=dialog] button', { hasText: 'שמירה (3 נבחרו)' }).count()) === 1, 'E: the editor opens with all three habits');
    await p.locator('[role=dialog] button', { hasText: 'שמירה' }).click();
    await p.waitForTimeout(500);
    const after = await stored(p);
    check(JSON.stringify(after.goalHistory) === JSON.stringify(before.goalHistory), 'E: saving without a change keeps habits, frequencies and goals');
    check(after.logs.length === before.logs.length, 'E: the history is intact', `${before.logs.length} → ${after.logs.length}`);
    await p.click('[aria-label^="לימוד יומי"]');
    const suggested = await p.locator('text=נוספו כהצעה בגרסה קודמת').waitFor().then(() => true, () => false);
    check(suggested, 'E: the old default tracks are shown as suggested – not as the user\'s choice');
    await p.locator('button', { hasText: 'להשאיר אותם' }).click();
    await p.waitForTimeout(400);
    const kept = await stored(p);
    check(kept.learningTracksChosen === true && JSON.stringify(kept.learningTracks) === JSON.stringify(before.learningTracks), 'E: "keep them" keeps exactly those tracks, now as a choice');
    await ctx.close();
  });

  // N – a clean install, to the first entry and its undo.
  await block(async () => {
    const { p, ctx } = await open(null);
    await p.fill('#onboarding-name', 'חדש');
    await p.click('text=המשך');
    await p.locator('button[aria-pressed]', { hasText: 'לימוד יומי' }).first().click();
    await p.click('text=/המשך \\(1 נבחרו\\)/');
    await p.click('text=מתחילים');
    await p.waitForTimeout(700);
    check((await stored(p)).learningTracks.length === 0, 'N: a new user has no learning track chosen for them');
    await p.click('[aria-label^="הצעד הבא"]');
    await p.waitForTimeout(900);
    const toast = await p.locator('[role=status]').filter({ has: p.locator('button[aria-label="סגירה"]') }).innerText().catch(() => '');
    check(/נרשם: לימוד תורה/.test(toast) && /היעד היומי הושלם|הרגל הושלם/.test(toast), 'N: the first entry completes the habit, says so, and names what was recorded', toast.replace(/\s+/g, ' '));
    await p.locator('[role=status] button[aria-label^="ביטול"]').click();
    await p.waitForTimeout(600);
    check((await stored(p)).logs.length === 0, 'N: "ביטול" removes it');
    await p.click('[aria-label^="לימוד יומי"]');
    await p.locator('[aria-label^="הוספת מסלול:"]').first().waitFor();
    check((await p.locator('[aria-label^="הוספת מסלול:"]').count()) === 3, 'N: the learning screen offers three tracks, as suggestions');
    await ctx.close();
  });

  // L – the reader.
  await block(async () => {
    const s = { ...onboarded(), learningTracks: ['dailyHalacha'], learningTracksChosen: true };
    const { p, ctx, calls } = await open(s, { sefaria: (n) => (n === 1 ? { status: 429, raw: '<html>Too Many Requests</html>' } : { status: 200, body: segments(173) }) });
    await openReader(p);
    await p.locator('text=סעיף 1 של הלכות תפילין').waitFor({ timeout: 15000 });
    check(calls.length === 2, 'L: a 429 from Sefaria is retried, and the text comes', String(calls.length));
    check((await p.locator('.reader-text').count()) === 60, 'L: the first part of a long text…');
    await p.locator('button', { hasText: /המשך הקריאה \(113/ }).click();
    await p.locator('button', { hasText: /המשך הקריאה \(53/ }).click();
    check((await p.locator('.reader-text').count()) === 173, 'L: …and all of it – nothing cut (the old code stopped at 80)');
    check((await p.locator('text=/מהדורה: Torat Emet 357 · רישיון: Public Domain/').count()) === 1, 'L: source, edition and licence under the text');
    check((await stored(p)).logs.length === 0, 'L: opening a text records nothing');
    await p.locator('[role=dialog] button', { hasText: 'למדתי – לרשום' }).click();
    await p.waitForTimeout(700);
    check((await stored(p)).logs.some((l) => l.actionKey === 'learningTrack'), 'L: "למדתי – לרשום" records the learning');
    await p.locator('[role=dialog] button[aria-label="סגירה"]').click();
    // Read once → readable without a network (the device copy, with its date). Sefaria cannot answer.
    await ctx.setOffline(true);
    const before = calls.length;
    await p.click('[aria-label="קריאה: הלכה יומית"]');
    const fromDevice = await p.locator('[role=dialog] p', { hasText: 'נשמר במכשיר' }).waitFor().then(() => true, () => false);
    check(fromDevice && calls.length === before, 'L: without a network, the text read before is read from the device (no request)', `${before} → ${calls.length}`);
    await ctx.close();
  });
  await block(async () => {
    const s = { ...onboarded(), learningTracks: ['dailyHalacha'], learningTracksChosen: true };
    const { p, ctx } = await open(s, { sefaria: () => ({ status: 429, raw: 'busy' }) });
    await openReader(p);
    await p.locator('[role=alert]').waitFor({ timeout: 20000 });
    check((await p.locator('text=ספריא עמוסה כרגע').count()) === 1, 'L: a failure says why (429: Sefaria is busy)');
    await p.locator('summary', { hasText: 'פרטים טכניים' }).click();
    const tech = await p.locator('details p').innerText();
    check(/rate-limited · Kitzur_Shulchan_Arukh\.10 · HTTP 429 · \d+ ms · attempts 3/.test(tech), 'L: the technical reason is on the screen (kind, ref, status, time, attempts)', tech);
    check((await p.locator('[role=dialog] button', { hasText: 'לנסות שוב' }).count()) === 1 && (await p.locator('[role=dialog] a', { hasText: 'פתיחה בספריא' }).count()) === 1, 'L: retry and the link to the source are offered');
    await ctx.close();
  });
  await block(async () => {
    const s = { ...onboarded(), learningTracks: ['dailyHalacha'], learningTracksChosen: true };
    const { p, ctx } = await open(s, { sefaria: () => 'abort' });
    // The screen's code is in the app (the APK); in this browser it is loaded before going offline.
    await p.click('[aria-label^="לימוד יומי"]');
    await p.locator('[aria-label="קריאה: הלכה יומית"]').waitFor();
    await ctx.setOffline(true);
    await p.click('[aria-label="קריאה: הלכה יומית"]');
    await p.locator('[role=alert]').waitFor({ timeout: 20000 });
    check((await p.locator('text=/אין חיבור לאינטרנט, והטקסט של היום עוד לא נשמר/').count()) === 1, 'L: offline and never read: a defined message, not "could not load"');
    await ctx.close();
  });

  // Q – the add sheet opened for one prayer starts on its minyan choice (no flash of the list).
  await block(async () => {
    const { p, ctx } = await open(onboarded());
    await p.evaluate(() => {
      window.__labels = [];
      new MutationObserver(() => document.querySelectorAll('[role=dialog]').forEach((d) => window.__labels.push(d.getAttribute('aria-label')))).observe(document.body, { childList: true, subtree: true });
    });
    await p.locator('button', { hasText: 'זמנים, סידור ומצוות היום לפי הלוח' }).click();
    await p.locator('button', { hasText: 'זמני תפילה' }).click();
    await p.click('[aria-label="סימון: ערבית"]');
    await p.locator('[role=dialog][aria-label="פרטי הרישום: ערבית"]').waitFor();
    const labels = await p.evaluate(() => window.__labels);
    check(!labels.includes('הוספת פעולה'), 'Q: the sheet never shows the whole list first', JSON.stringify([...new Set(labels)]));
    await ctx.close();
  });
} finally {
  await browser.close();
  try {
    process.kill(-proc.pid);
  } catch {}
  fs.rmSync(OUT, { recursive: true, force: true });
}

console.log(`Round 14: ${passed.length} passed, ${failures.length} failed`);
for (const n of passed) console.log(`  PASS ${n}`);
for (const f of failures) console.log(`  FAIL ${f}`);
process.exit(failures.length === 0 ? 0 : 1);
