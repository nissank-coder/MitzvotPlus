// Round 13 (review 26.11.2026, §5) – the core fixes in the real app, on a PRODUCTION build:
//   U1 the habit editor keeps weekly habits and those not due today;
//   U2 dialogs: focus set once (not pulled back every second), Tab stays inside, the page behind is
//      inert, Escape closes, focus returns to the opener;
//   U3 a goal toast about a blessing that was removed elsewhere disappears;
//   U5 every prayer entry point asks "במניין / ביחידות"; a double tap on "הצעד הבא" records once;
//   U6 every entry can be reached for a correction (blessings, Home, the journal).
//   node scripts/e2e/round-13.mjs
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

const OUT = 'dist-r13';
const b = spawnSync('npx', ['vite', 'build', '--outDir', OUT, '--emptyOutDir'], { encoding: 'utf8' });
if (b.status !== 0) throw new Error(b.stderr);
// Own process group: stopping it stops vite too (a leftover server would serve a deleted build).
const proc = spawn('npx', ['vite', 'preview', '--outDir', OUT, '--port', '4179', '--strictPort'], { stdio: 'ignore', detached: true });
const URL = 'http://localhost:4179';
for (let i = 0; i < 80; i += 1) {
  try {
    if ((await fetch(URL)).ok) break;
  } catch {}
  await new Promise((r) => setTimeout(r, 250));
}

const iso = (d, h, m = 0) => new Date(`${d}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+02:00`).getTime();
const onboarded = (now, habits = [{ id: 'three-prayers', perWeek: 7 }, { id: 'learn-daily', perWeek: 7 }]) =>
  reducer(createFreshState(now - 10 * 86400000), {
    type: 'completeOnboarding',
    payload: { userName: 'בודק', dailyGoal: 5, profile: { gender: 'male', cityId: 'jerusalem' }, dateKey: '2026-11-15', habits },
  });
const add = (s, key, when, dateKey, extra = {}) => reducer(s, { type: 'addAction', payload: { key, now: when, dateKey, ...extra } });

async function open(browser, now, state) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Jerusalem', locale: 'he-IL' });
  const p = await ctx.newPage();
  p.setDefaultTimeout(8000);
  await p.addInitScript({ path: 'scripts/e2e/fakedate.js' });
  await p.goto(URL);
  await p.evaluate(([n, s]) => {
    localStorage.clear();
    localStorage.setItem('__fakeNow', String(n));
    localStorage.setItem('mitzvot_plus_state_v1', JSON.stringify(s));
  }, [now, state]);
  await p.reload();
  await p.waitForTimeout(700);
  return { p, ctx };
}
const stored = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('mitzvot_plus_state_v1')));
const toastCount = (p) => p.locator('[role=status]').filter({ has: p.locator('button[aria-label="סגירה"]') }).count();

const browser = await chromium.launch();
// Each scenario on its own: one that cannot even start (e.g. on the code before the fix) is
// reported as a failure, and the others still run.
async function block(fn) {
  try {
    await fn();
  } catch (e) {
    failures.push(`exception: ${e.message.split('\n')[0]}`);
  }
}
try {
  // U1 – Shabbat: tefillin not due, gratitude weekly. "Save" without a change keeps all three.
  await block(async () => {
    const SHABBAT = iso('2026-11-28', 13);
    const habits = [{ id: 'learn-daily', perWeek: 7 }, { id: 'tefillin', perWeek: 7 }, { id: 'gratitude', perWeek: 3 }];
    const { p, ctx } = await open(browser, SHABBAT, onboarded(SHABBAT, habits));
    const before = await stored(p);
    await p.locator('[aria-label="ההרגלים שלי"] button', { hasText: 'שינוי' }).click();
    await p.waitForTimeout(300);
    check((await p.locator('[role=dialog] button', { hasText: 'שמירה (3 נבחרו)' }).count()) === 1, 'U1: on Shabbat the editor starts with all three habits (weekly and not-due included)');
    await p.locator('[role=dialog] button', { hasText: 'שמירה' }).click();
    await p.waitForTimeout(600);
    const after = await stored(p);
    check(JSON.stringify(after.goalHistory) === JSON.stringify(before.goalHistory), 'U1: saving without a change changes nothing (no habit lost, no new snapshot)');
    await ctx.close();
  });

  // U2 – the speech-guard reset dialog: the screen renders every second.
  await block(async () => {
    const NOW = iso('2026-11-24', 18);
    let s = onboarded(NOW);
    s = reducer(s, { type: 'startSpeech' });
    const { p, ctx } = await open(browser, NOW, s);
    await p.click('[aria-label^="שמירת הלשון"]');
    await p.waitForTimeout(400);
    const opener = p.locator('button', { hasText: 'רישום מעידה ואיפוס' });
    await opener.focus();
    await opener.click();
    await p.waitForTimeout(300);
    const dialog = p.locator('[role=dialog]');
    check((await dialog.count()) === 1, 'U2: the reset dialog opens');
    check((await p.evaluate(() => document.getElementById('root')?.hasAttribute('inert'))) === true, 'U2: the page behind the dialog is inert');
    const focusedText = () => p.evaluate(() => document.activeElement?.textContent?.trim() ?? '');
    const insideDialog = () => p.evaluate(() => Boolean(document.activeElement?.closest('[role=dialog]')));
    const first = await focusedText();
    await p.keyboard.press('Tab');
    const moved = await focusedText();
    await p.waitForTimeout(3200); // three re-renders of the timer
    check(moved !== first && (await focusedText()) === moved, 'U2: the focus stays where the user moved it while the screen renders every second', `${first} → ${moved} → ${await focusedText()}`);
    let inside = true;
    for (let i = 0; i < 5; i += 1) {
      await p.keyboard.press('Tab');
      inside = inside && (await insideDialog());
    }
    await p.keyboard.press('Shift+Tab');
    inside = inside && (await insideDialog());
    check(inside, 'U2: Tab and Shift+Tab stay inside the dialog');
    await p.keyboard.press('Escape');
    await p.waitForTimeout(300);
    check((await dialog.count()) === 0, 'U2: Escape closes the dialog');
    check((await focusedText()) === 'רישום מעידה ואיפוס', 'U2: the focus returns to the button that opened it', await focusedText());
    check((await p.evaluate(() => document.getElementById('root')?.hasAttribute('inert'))) === false, 'U2: the page is active again after closing');
    await ctx.close();
  });

  // U5 – the minyan choice everywhere; a double tap on "הצעד הבא" records once.
  await block(async () => {
    const NOW = iso('2026-11-24', 18);
    const { p, ctx } = await open(browser, NOW, onboarded(NOW));
    await p.click('[aria-label="רישום תפילה: שלוש תפילות"]');
    await p.locator('[role=dialog] button', { hasText: 'מנחה' }).click();
    check((await p.locator('[role=dialog][aria-label="פרטי הרישום: מנחה"]').count()) === 1, 'U5: a prayer chosen from a habit asks "במניין או ביחידות"');
    check((await stored(p)).logs.length === 0, 'U5: nothing is recorded before the choice');
    await p.locator('[role=dialog] button', { hasText: 'מנחה במניין' }).click();
    await p.waitForTimeout(900);
    const logs = (await stored(p)).logs;
    check(logs.length === 1 && logs[0].actionKey === 'mincha' && logs[0].minyan === true, 'U5: the choice is recorded as chosen (in a minyan)', JSON.stringify(logs.map((l) => [l.actionKey, l.minyan])));
    // The prayer-times screen: the same choice (no separate checkbox any more).
    await p.locator('[role=status] button[aria-label="סגירה"]').click();
    await p.locator('button', { hasText: 'זמנים, סידור ומצוות היום לפי הלוח' }).click();
    await p.locator('button', { hasText: 'זמני תפילה' }).click();
    await p.waitForTimeout(400);
    await p.click('[aria-label="סימון: ערבית"]');
    check((await p.locator('[role=dialog][aria-label="פרטי הרישום: ערבית"]').count()) === 1, 'U5: the prayer-times screen asks the same choice');
    await ctx.close();
  });
  await block(async () => {
    const NOW = iso('2026-11-24', 18);
    const habits = [{ id: 'learn-daily', perWeek: 7 }, { id: 'birkat-hamazon', perWeek: 7 }];
    const { p, ctx } = await open(browser, NOW, onboarded(NOW, habits));
    await p.locator('[aria-label^="הצעד הבא"]').dblclick();
    await p.waitForTimeout(1500);
    const keys = (await stored(p)).logs.map((l) => l.actionKey);
    check(keys.length === 1 && keys[0] === 'torahStudy', 'U5: a double tap on "הצעד הבא" records the tapped habit once – not the next one', JSON.stringify(keys));
    check((await p.locator('[aria-label^="הצעד הבא"]').getAttribute('aria-label'))?.includes('ברכת המזון'), 'U5: afterwards the next step moves on');
    await ctx.close();
  });

  // U6 – every entry reachable: 40 blessings, 8 entries on Home, 60 in the journal.
  await block(async () => {
    const NOW = iso('2026-11-24', 20);
    let s = onboarded(NOW);
    for (let i = 0; i < 40; i += 1) s = add(s, 'blessing', iso('2026-11-24', 7) + i * 60000, '2026-11-24', { category: 'other' });
    for (let d = 20; d <= 23; d += 1) for (let i = 0; i < 6; i += 1) s = add(s, 'torahStudy', iso(`2026-11-${d}`, 9) + i * 60000, `2026-11-${d}`);
    const { p, ctx } = await open(browser, NOW, s);
    const homeRows = () => p.locator('[aria-label="נרשם היום"] button[aria-label^="ביטול:"]').count();
    check((await homeRows()) === 5, 'U6: Home shows the 5 newest entries of today');
    await p.locator('[aria-label="נרשם היום"] button', { hasText: /הצגת כל 40 הרישומים/ }).click();
    check((await homeRows()) === 40, 'U6: …and all of today on one tap', String(await homeRows()));
    await p.click('[aria-label^="100 ברכות"]');
    await p.waitForTimeout(400);
    const rows = () => p.locator('button[aria-label^="ביטול הרישום: ברכה"]').count();
    check((await rows()) === 12, 'U6: the blessings list starts with 12');
    await p.locator('button', { hasText: /^הצגת עוד 20/ }).click();
    await p.locator('button', { hasText: /^הצגת עוד 8/ }).click();
    check((await rows()) === 40, 'U6: …and reaches all 40 – the earliest one too', String(await rows()));
    await p.locator('button[aria-label^="ביטול הרישום: ברכה"]').last().click();
    await p.locator('[role=dialog] button', { hasText: 'הסרה' }).click();
    await p.waitForTimeout(700);
    const left = (await stored(p)).logs.filter((l) => l.actionKey === 'blessing');
    check(left.length === 39 && !left.some((l) => l.createdAt === iso('2026-11-24', 7)), 'U6: the earliest blessing is corrected without deleting any other');
    await ctx.close();
  });

  // U3 – the 100th blessing is removed on the blessings screen while its goal toast shows.
  await block(async () => {
    const NOW = iso('2026-11-24', 18);
    let s = onboarded(NOW);
    for (let i = 0; i < 99; i += 1) s = add(s, 'blessing', iso('2026-11-24', 7) + i * 60000, '2026-11-24', { category: 'other' });
    const { p, ctx } = await open(browser, NOW, s);
    await p.click('[aria-label^="100 ברכות"]');
    await p.waitForTimeout(300);
    await p.locator('main [aria-label^="+ ברכה"]').first().click();
    await p.waitForTimeout(900);
    check((await toastCount(p)) === 1, 'U3: reaching the goal shows the toast');
    await p.locator('button[aria-label^="ביטול הרישום: ברכה"]').first().click();
    await p.locator('[role=dialog] button', { hasText: 'הסרה' }).click();
    await p.waitForTimeout(500);
    check((await toastCount(p)) === 0, 'U3: removing that blessing elsewhere removes the goal toast (99 again)');
    await ctx.close();
  });
} catch (e) {
  failures.push(`exception: ${e.message.split('\n')[0]}`);
} finally {
  await browser.close();
  try {
    process.kill(-proc.pid);
  } catch {}
  fs.rmSync(OUT, { recursive: true, force: true });
}

console.log(`Round 13: ${passed.length} passed, ${failures.length} failed`);
for (const n of passed) console.log(`  PASS ${n}`);
for (const f of failures) console.log(`  FAIL ${f}`);
process.exit(failures.length === 0 ? 0 : 1);
