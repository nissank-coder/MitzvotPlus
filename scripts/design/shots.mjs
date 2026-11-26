// Screenshots and layout checks of the RUNNING app (not a mock-up).
// Round 1.1: by default a PRODUCTION build – exactly what ships: no Dvar Torah (no approved content),
// no community tab, no drafts; the build is checked for leaked internal content before any capture.
// With --demo: an internal build (VITE_DEMO_CONTENT=true) for screens that need content that does not
// exist in production yet (the marked TEST_ONLY Dvar Torah) – written to a separate, labelled folder.
// The browser storage is seeded with synthetic states made by the app's own reducer; each scenario
// is captured at 360/390/430 px. Checks: no horizontal scrolling, no console error, targets < 44px.
//   node scripts/design/shots.mjs [--demo] [--out dir] [--widths 360,390,430]
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const require = createRequire(import.meta.url);
const ts = require('typescript');
require.extensions['.ts'] = (m, f) =>
  m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), { compilerOptions: { module: 1, target: 9, esModuleInterop: true, jsx: 2 } }).outputText, f);
const { createFreshState, reducer } = require('../../src/store/state.ts');

const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => (a.startsWith('--') ? [a.slice(2), all[i + 1]] : [])).filter((x) => x.length));
const DEMO = process.argv.includes('--demo');
const OUT = args.out ?? (DEMO ? 'docs/design/round-1.1/shots-internal-build' : 'docs/design/round-1.1/shots');
const WIDTHS = (args.widths ?? '360,390,430').split(',').map(Number);
const NOW = new Date('2026-11-24T18:30:00+02:00').getTime(); // Tuesday evening, Jerusalem
const PORT = 4176;
const DIST = 'dist-design';
fs.mkdirSync(OUT, { recursive: true });

const buildEnv = { ...process.env, VITE_BUILD_COMMIT: process.env.VITE_BUILD_COMMIT ?? spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim() };
if (DEMO) buildEnv.VITE_DEMO_CONTENT = 'true';
else delete buildEnv.VITE_DEMO_CONTENT;
const build = spawnSync('npx', ['vite', 'build', '--outDir', DIST, '--emptyOutDir'], { env: buildEnv, encoding: 'utf8' });
if (build.status !== 0) {
  console.log(build.stdout, build.stderr);
  process.exit(1);
}
// A production capture must show the production app: refuse if internal content leaked into it.
if (!DEMO) {
  const leaked = [];
  const walk = (d) => fs.readdirSync(d).forEach((f) => {
    const full = path.join(d, f);
    if (fs.statSync(full).isDirectory()) return walk(full);
    if (/\.(js|html)$/.test(f) && /TEST-ONLY-NOT-FOR-DISTRIBUTION|DRAFT-NOT-APPROVED|נועם לוי/.test(fs.readFileSync(full, 'utf8'))) leaked.push(full);
  });
  walk(DIST);
  if (leaked.length) {
    console.log(`Not a production build – internal content in: ${leaked.join(', ')}`);
    process.exit(1);
  }
}
const preview = spawn('npx', ['vite', 'preview', '--outDir', DIST, '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
const url = `http://localhost:${PORT}`;
for (let i = 0; i < 80; i += 1) {
  try {
    if ((await fetch(url)).ok) break;
  } catch {}
  await new Promise((r) => setTimeout(r, 250));
}

/* ------------------------- synthetic states (app reducer) ------------------------- */
const at = (h, m = 0) => new Date(`2026-11-24T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+02:00`).getTime();
const base = () =>
  reducer(createFreshState(NOW - 9 * 86400000), {
    type: 'completeOnboarding',
    payload: {
      userName: 'דניאל',
      dailyGoal: 5,
      profile: { gender: 'male', cityId: 'jerusalem' },
      dateKey: '2026-11-15',
      habits: [
        { id: 'three-prayers', perWeek: 7 },
        { id: 'learn-daily', perWeek: 7 },
        { id: 'gratitude', perWeek: 3 },
      ],
    },
  });
const add = (s, key, when, extra = {}) => reducer(s, { type: 'addAction', payload: { key, now: when, dateKey: new Date(when + 2 * 3600000).toISOString().slice(0, 10), ...extra } });
const fresh = () => base();
const active = () => {
  let s = base();
  // earlier days of the week (goal days and partial days)
  for (const [d, keys] of [
    [22, ['shacharit', 'mincha', 'arvit', 'torahStudy']],
    [23, ['shacharit', 'torahStudy', 'gratitude']],
  ]) {
    for (const [i, k] of keys.entries()) s = add(s, k, new Date(`2026-11-${d}T${String(7 + i).padStart(2, "0")}:00:00+02:00`).getTime());
  }
  s = add(s, 'shacharit', at(7, 10), { minyan: true });
  s = add(s, 'mincha', at(13, 40));
  s = add(s, 'torahStudy', at(16, 5));
  for (let i = 0; i < 37; i += 1) s = reducer(s, { type: 'addAction', payload: { key: 'blessing', category: i % 3 === 0 ? 'enjoyment' : i % 3 === 1 ? 'prayer' : 'mitzvah', now: at(7, 0) + i * 9 * 60000, dateKey: '2026-11-24' } });
  return s;
};
const withBlessings = (n) => {
  let s = base();
  for (let i = 0; i < n; i += 1) s = reducer(s, { type: 'addAction', payload: { key: 'blessing', category: 'other', now: at(6, 30) + i * 6 * 60000, dateKey: '2026-11-24' } });
  return s;
};
const SUNDAY = new Date('2026-11-29T10:00:00+02:00').getTime(); // the Sunday after Shabbat 28.11
const sundayWithShacharit = () => add(base(), 'shacharit', new Date('2026-11-29T08:00:00+02:00').getTime());
const ninetyNine = () => withBlessings(99);
const speechStarted = () => ({ ...base(), speech: { since: NOW - (3 * 86400000 + 4 * 3600000 + 12 * 60000), bestMs: 9 * 86400000, resets: 2, completedMs: 14 * 86400000, undo: null } });

/* ----------------------------------- scenarios ----------------------------------- */
const tab = (p, label) => p.locator('nav button', { hasText: label }).click();
const settle = (p, ms = 500) => p.waitForTimeout(ms);
const SCENARIOS = [
  { name: '01-home-new-user', state: fresh, go: async () => {} },
  { name: '02-home-active', state: active, go: async () => {} },
  { name: '03-add-sheet', state: active, go: async (p) => { await p.click('[aria-label="הוספת פעולה"]'); await settle(p); }, viewportOnly: true },
  { name: '04-add-sheet-prayer-detail', state: fresh, go: async (p) => { await p.click('[aria-label="הוספת פעולה"]'); await p.locator('[role=dialog] button', { hasText: 'ערבית' }).click(); await settle(p); }, viewportOnly: true },
  { name: '05-blessings-zero', state: fresh, go: async (p) => { await p.click('[aria-label^="100 ברכות"]'); await settle(p); } },
  { name: '06-blessings-partial', state: active, go: async (p) => { await p.click('[aria-label^="100 ברכות"]'); await settle(p); } },
  { name: '07-blessings-goal', state: () => withBlessings(104), go: async (p) => { await p.click('[aria-label^="100 ברכות"]'); await settle(p); } },
  { name: '08-torah-reading', demoOnly: true, state: fresh, go: async (p) => { await p.click('[aria-label^="דבר תורה"]'); await settle(p); } },
  { name: '09-torah-recorded', demoOnly: true, state: fresh, go: async (p) => { await p.click('[aria-label^="דבר תורה"]'); await p.click('text=למדתי – לרשום לימוד'); await settle(p, 900); } },
  { name: '10-speech-first', state: fresh, go: async (p) => { await p.click('[aria-label^="שמירת הלשון"]'); await settle(p); } },
  { name: '11-speech-running', state: speechStarted, go: async (p) => { await p.click('[aria-label^="שמירת הלשון"]'); await settle(p); } },
  { name: '12-speech-reset-confirm', state: speechStarted, go: async (p) => { await p.click('[aria-label^="שמירת הלשון"]'); await p.click('text=רישום מעידה ואיפוס'); await settle(p); }, viewportOnly: true },
  { name: '13-speech-after-reset', state: speechStarted, go: async (p) => { await p.click('[aria-label^="שמירת הלשון"]'); await p.click('text=רישום מעידה ואיפוס'); await p.locator('[role=dialog] button', { hasText: 'לרשום ולהתחיל מחדש' }).click(); await settle(p); } },
  // Recording and its effect on Home: before → tap in the sheet → toast with undo → Home updated.
  { name: '14-record-before', state: fresh, go: async () => {} },
  { name: '15-record-toast', state: fresh, go: async (p) => { await p.click('[aria-label="הוספת פעולה"]'); await p.locator('[role=dialog] button', { hasText: 'שחרית' }).click(); await p.locator('[role=dialog] button', { hasText: 'שחרית במניין' }).click(); await settle(p, 900); }, viewportOnly: true },
  { name: '16-record-after', state: fresh, go: async (p) => { await p.click('[aria-label="הוספת פעולה"]'); await p.locator('[role=dialog] button', { hasText: 'שחרית' }).click(); await p.locator('[role=dialog] button', { hasText: 'שחרית במניין' }).click(); await settle(p, 900); await p.locator('[role=status] button', { hasText: 'סגירה' }).click().catch(() => {}); await p.click('[aria-label="סגירה"]').catch(() => {}); await settle(p); } },
  // Round 1.1: partial progress, the Shabbat sheet and the blessing goal reached from Home.
  { name: '17-partial-progress-toast', state: fresh, go: async (p) => { await p.click('[aria-label="רשמתי: שלוש תפילות"]'); await p.locator('[role=dialog] button', { hasText: 'מנחה' }).click(); await settle(p, 900); }, viewportOnly: true },
  { name: '18-home-partial-progress', state: () => add(base(), 'mincha', at(13, 40)), go: async () => {} },
  { name: '19-shabbat-sheet', state: sundayWithShacharit, now: SUNDAY, go: async (p) => { await p.click('text=/שבוע טוב/'); await settle(p); }, viewportOnly: true },
  { name: '20-shabbat-recorded-toast', state: sundayWithShacharit, now: SUNDAY, go: async (p) => { await p.click('text=/שבוע טוב/'); await p.locator('[role=dialog] [role=checkbox]').first().click(); await p.locator('[role=dialog] button', { hasText: 'שמירה' }).click(); await settle(p, 900); }, viewportOnly: true },
  { name: '21-blessing-goal-from-home', state: ninetyNine, go: async (p) => { await p.locator('[aria-label^="+ ברכה"]').first().click(); await settle(p, 900); }, viewportOnly: true },
].filter((sc) => DEMO || !sc.demoOnly);

const browser = await chromium.launch();
const report = [];
const failures = [];
for (const width of WIDTHS) {
  for (const sc of SCENARIOS) {
    const ctx = await browser.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: width === 390 ? 2 : 1, timezoneId: 'Asia/Jerusalem', locale: 'he-IL', reducedMotion: 'reduce' });
    const p = await ctx.newPage();
    const errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await p.addInitScript({ path: 'scripts/e2e/fakedate.js' });
    await p.goto(url);
    await p.evaluate(([n, s]) => {
      localStorage.clear();
      localStorage.setItem('__fakeNow', String(n));
      localStorage.setItem('mitzvot_plus_state_v1', JSON.stringify(s));
    }, [sc.now ?? NOW, sc.state()]);
    await p.reload();
    await settle(p, 700);
    try {
      await sc.go(p);
    } catch (e) {
      failures.push(`${sc.name}@${width}: ${e.message.split('\n')[0]}`);
    }
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    const small = await p.evaluate(() =>
      [...document.querySelectorAll('button, a, [role=button], input, textarea')]
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && (r.height < 44 || r.width < 44);
        })
        .map((el) => (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 24)),
    );
    // A full-page capture would freeze the sticky bottom bar in mid-page: place it at the end.
    if (!sc.viewportOnly) await p.addStyleTag({ content: 'nav[aria-label="ניווט ראשי"]{position:static !important}' });
    const file = path.join(OUT, `${sc.name}-${width}.jpg`);
    await p.screenshot({ path: file, fullPage: !sc.viewportOnly, type: 'jpeg', quality: 82 });
    report.push({ scenario: sc.name, width, overflowPx: overflow, smallTargets: small, consoleErrors: errors });
    if (overflow > 0) failures.push(`${sc.name}@${width}: horizontal overflow ${overflow}px`);
    if (errors.length) failures.push(`${sc.name}@${width}: console ${errors.join(' | ')}`);
    await ctx.close();
  }
}

// Larger text: the page zoomed to 130 % (an approximation of the system text size on a phone).
for (const sc of SCENARIOS.filter((s) => ['01-home-new-user', '02-home-active', '06-blessings-partial', '08-torah-reading', '11-speech-running', '18-home-partial-progress'].includes(s.name))) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, timezoneId: 'Asia/Jerusalem', locale: 'he-IL', reducedMotion: 'reduce' });
  const p = await ctx.newPage();
  await p.addInitScript({ path: 'scripts/e2e/fakedate.js' });
  await p.goto(url);
  await p.evaluate(([n, s]) => {
    localStorage.clear();
    localStorage.setItem('__fakeNow', String(n));
    localStorage.setItem('mitzvot_plus_state_v1', JSON.stringify(s));
  }, [NOW, sc.state()]);
  await p.reload();
  await p.addStyleTag({ content: 'html { zoom: 1.3; } nav[aria-label="ניווט ראשי"]{position:static !important}' });
  await settle(p, 700);
  await sc.go(p).catch((e) => failures.push(`${sc.name}@zoom: ${e.message.split('\n')[0]}`));
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  await p.screenshot({ path: path.join(OUT, `${sc.name}-390-text130.jpg`), fullPage: true, type: 'jpeg', quality: 75 });
  report.push({ scenario: sc.name, width: '390 @130%', overflowPx: overflow });
  if (overflow > 0) failures.push(`${sc.name}@390x130%: horizontal overflow ${overflow}px`);
  await ctx.close();
}

await browser.close();
preview.kill();
fs.rmSync(DIST, { recursive: true, force: true });
fs.writeFileSync(path.join(OUT, '..', DEMO ? 'layout-report-internal-build.json' : 'layout-report.json'), JSON.stringify({ build: DEMO ? 'internal (VITE_DEMO_CONTENT=true)' : 'production', commit: buildEnv.VITE_BUILD_COMMIT, captures: report }, null, 2));
console.log(`Design shots (${DEMO ? 'internal build' : 'production build'}, ${buildEnv.VITE_BUILD_COMMIT.slice(0, 7)}): ${report.length} captures, ${failures.length} problems`);
for (const f of failures) console.log(`  FAIL ${f}`);
process.exit(failures.length ? 1 : 0);
