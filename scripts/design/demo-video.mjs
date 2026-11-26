// Round 14 (review v4 §7–8): a short demo of the core flow on a PRODUCTION build, recorded by the
// browser (Chromium at 390×844 – not a phone): choose → record → undo → record again → partial
// progress → habit complete → daily goal complete. Each step is checked, and a frame of it is kept,
// so the video is also a test. Synthetic user, created by the app's own reducer.
//   node scripts/design/demo-video.mjs [--out docs/design/round-14/demo]
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const require = createRequire(import.meta.url);
const ts = require('typescript');
require.extensions['.ts'] = (m, f) =>
  m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), { compilerOptions: { module: 1, target: 9, esModuleInterop: true } }).outputText, f);
const { createFreshState, reducer } = require('../../src/store/state.ts');

const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => (a.startsWith('--') ? [a.slice(2), all[i + 1]] : [])).filter((x) => x.length));
const OUT = args.out ?? 'docs/design/round-14/demo';
fs.mkdirSync(OUT, { recursive: true });
const DIST = 'dist-demo-video';
const commit = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
const b = spawnSync('npx', ['vite', 'build', '--outDir', DIST, '--emptyOutDir'], { env: { ...process.env, VITE_BUILD_COMMIT: commit }, encoding: 'utf8' });
if (b.status !== 0) throw new Error(b.stderr);
const preview = spawn('npx', ['vite', 'preview', '--outDir', DIST, '--port', '4182', '--strictPort'], { stdio: 'ignore', detached: true });
const URL = 'http://localhost:4182';
for (let i = 0; i < 80; i += 1) {
  try {
    if ((await fetch(URL)).ok) break;
  } catch {}
  await new Promise((r) => setTimeout(r, 250));
}

const NOW = new Date('2026-11-24T18:30:00+02:00').getTime();
const state = reducer(createFreshState(NOW - 6 * 86400000), {
  type: 'completeOnboarding',
  payload: { userName: 'דניאל', dailyGoal: 5, profile: { gender: 'male', cityId: 'jerusalem' }, dateKey: '2026-11-18', habits: [{ id: 'three-prayers', perWeek: 7 }, { id: 'learn-daily', perWeek: 7 }] },
});

const steps = [];
const failures = [];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, timezoneId: 'Asia/Jerusalem', locale: 'he-IL', recordVideo: { dir: OUT, size: { width: 390, height: 844 } } });
const p = await ctx.newPage();
p.setDefaultTimeout(8000);
await p.addInitScript({ path: 'scripts/e2e/fakedate.js' });
await p.goto(URL);
await p.evaluate(([n, s]) => {
  localStorage.clear();
  localStorage.setItem('__fakeNow', String(n));
  localStorage.setItem('mitzvot_plus_state_v1', JSON.stringify(s));
}, [NOW, state]);
await p.reload();
const pause = (ms = 900) => p.waitForTimeout(ms);
const toast = async () => (await p.locator('[role=status]').filter({ has: p.locator('button[aria-label="סגירה"]') }).first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
const logs = () => p.evaluate(() => JSON.parse(localStorage.getItem('mitzvot_plus_state_v1')).logs);
async function step(name, fn, expect) {
  await fn();
  await pause();
  const ok = await expect();
  const file = `${String(steps.length + 1).padStart(2, '0')}-${name}.jpg`;
  await p.screenshot({ path: path.join(OUT, file), type: 'jpeg', quality: 80 });
  steps.push({ step: name, ok: Boolean(ok), frame: file });
  if (!ok) failures.push(name);
}

await pause(1200);
await step('start', async () => {}, async () => (await p.locator('text=/^0\\/2$/').count()) === 1);
await step('choose-prayer', () => p.click('[aria-label="רישום תפילה: שלוש תפילות"]'), async () => (await p.locator('[role=dialog][aria-label^="איזו תפילה?"]').count()) === 1);
await step('choose-minyan', () => p.locator('[role=dialog] button', { hasText: 'שחרית' }).click(), async () => (await p.locator('[role=dialog][aria-label="פרטי הרישום: שחרית"]').count()) === 1);
await step('recorded-partial', () => p.locator('[role=dialog] button', { hasText: 'שחרית במניין' }).click(), async () => /נרשם: שחרית במניין/.test(await toast()) && /תפילה אחת מתוך שלוש היום/.test(await toast()));
await step('undo', () => p.locator('[role=status] button[aria-label^="ביטול"]').click(), async () => (await logs()).length === 0);
await step('record-again', async () => {
  await p.click('[aria-label="רישום תפילה: שלוש תפילות"]');
  await p.locator('[role=dialog] button', { hasText: 'שחרית' }).click();
  await p.locator('[role=dialog] button', { hasText: 'שחרית ביחידות' }).click();
}, async () => (await logs()).length === 1 && (await p.locator('[data-testid="hero-partial"]').innerText()).includes('תפילה אחת מתוך שלוש'));
await step('second-prayer', async () => {
  await pause(4200); // the previous toast goes away by itself
  await p.click('[aria-label="רישום תפילה: שלוש תפילות"]');
  await p.locator('[role=dialog] button', { hasText: 'מנחה' }).click();
  await p.locator('[role=dialog] button', { hasText: 'מנחה ביחידות' }).click();
}, async () => /שתי תפילות מתוך שלוש היום/.test(await toast()));
await step('habit-complete', async () => {
  await pause(4200);
  await p.click('[aria-label="רישום תפילה: שלוש תפילות"]');
  await p.locator('[role=dialog] button', { hasText: 'ערבית' }).click();
  await p.locator('[role=dialog] button', { hasText: 'ערבית ביחידות' }).click();
}, async () => /הרגל הושלם: שלוש תפילות/.test(await toast()) && /נרשם: ערבית/.test(await toast()));
await step('goal-complete', async () => {
  await pause(4200);
  await p.locator('[aria-label^="הצעד הבא"]').click();
}, async () => /היעד היומי הושלם/.test(await toast()) && /נרשם: לימוד תורה/.test(await toast()) && (await p.locator('text=/^2\\/2$/').count()) === 1);
await pause(1500);

const video = await p.video()?.path();
await ctx.close();
await browser.close();
try {
  process.kill(-preview.pid);
} catch {}
fs.rmSync(DIST, { recursive: true, force: true });
// webm → mp4 (H.264) where ffmpeg exists, for phones that do not play webm.
let mp4 = null;
if (video) {
  const webm = path.join(OUT, 'demo-choose-record-undo-complete.webm');
  fs.renameSync(video, webm);
  const f = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', webm, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path.join(OUT, 'demo-choose-record-undo-complete.mp4')]);
  if (f.status === 0) mp4 = 'demo-choose-record-undo-complete.mp4';
}
fs.writeFileSync(path.join(OUT, 'demo.json'), JSON.stringify({ build: 'production', commit, browser: 'Chromium 390×844 (not a phone)', steps, video: mp4 ?? 'demo-choose-record-undo-complete.webm' }, null, 2));
console.log(`Demo (${commit.slice(0, 7)}): ${steps.filter((s) => s.ok).length}/${steps.length} steps as expected${failures.length ? ` – FAIL ${failures.join(', ')}` : ''}`);
process.exit(failures.length ? 1 : 0);
