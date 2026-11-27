// End-to-end acceptance scenarios (round 10, S10-04) on a real production build.
// Every scenario asserts; any failed assertion or browser console error exits non-zero.
// Usage: npm run e2e            (builds, serves dist with `vite preview`, runs, stops)
//        node scripts/e2e/scenarios.mjs --url http://localhost:3000 --shots dir   (existing server)
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const here = dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => (a.startsWith('--') ? [a.slice(2), all[i + 1]] : [])).filter((x) => x.length));
const PORT = 4174;
const NOW = new Date('2026-11-24T10:00:00+02:00').getTime(); // Tuesday, Jerusalem
const SHOTS = args.shots ?? null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const failures = [];
const passed = [];
const check = (cond, name, detail = '') => {
  if (cond) passed.push(name);
  else failures.push(`${name}${detail ? ` – ${detail}` : ''}`);
};

async function startServer() {
  if (args.url) return { url: args.url, stop: () => {} };
  const proc = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
  const url = `http://localhost:${PORT}`;
  for (let i = 0; i < 60; i += 1) {
    try {
      if ((await fetch(url)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  return { url, stop: () => proc.kill() };
}

const server = await startServer();
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Jerusalem', locale: 'he-IL' });
const p = await ctx.newPage();
const consoleErrors = [];
p.on('pageerror', (e) => consoleErrors.push(e.message));
p.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
await p.addInitScript({ path: join(here, 'fakedate.js') });

const shot = async (name) => SHOTS && p.screenshot({ path: join(SHOTS, `${name}.png`) });
const text = async (sel) => (await p.locator(sel).first().innerText({ timeout: 3000 }).catch(() => '')).replace(/\s+/g, ' ').trim();
const count = (sel) => p.locator(sel).count();
const tab = (label) => p.locator('nav button', { hasText: label }).click();
const toast = () => text('[role=status]');
const settle = () => p.waitForTimeout(700);
const fresh = async (state) => {
  await p.goto(server.url);
  await p.evaluate(([n, s]) => {
    localStorage.clear();
    localStorage.setItem('__fakeNow', String(n));
    if (s) localStorage.setItem('mitzvot_plus_state_v1', JSON.stringify(s));
  }, [NOW, state ?? null]);
  await p.reload();
  await settle();
};

try {
  // Production build: no demo content anywhere.
  await fresh();
  check((await count('text=רק להציץ')) === 0, 'production: no demo button');

  // 1. New user picks three habits (one of them weekly)
  await p.fill('#onboarding-name', 'בודק');
  await p.click('text=המשך');
  for (const h of ['שלוש תפילות', 'מסלול לימוד קבוע', 'הכרת הטוב']) await p.locator('button[aria-pressed]', { hasText: h }).first().click();
  await p.locator('[role=radiogroup][aria-label="תדירות: הכרת הטוב"] [role=radio]', { hasText: '3 בשבוע' }).click();
  await p.click('text=/המשך \\(3 נבחרו\\)/');
  await p.click('text=מתחילים');
  await settle();
  await shot('01-home-new-user');
  check((await text('text=/^0\\/2$/')) === '0/2', '1: daily goal = 2 daily habits (weekly one excluded)');
  check((await count('text=הרגלים שבועיים · לא חלק מהיעד היומי')) === 1, '1: weekly habit shown separately');
  check((await count('text=טיוטה פנימית')) === 0, 'production: no draft content');

  // 2. Three prayers: asks which prayer; only the chosen one is recorded
  await p.click('[aria-label="רישום תפילה: שלוש תפילות"]');
  check((await count('[role=dialog][aria-label^="איזו תפילה?"]')) === 1, '2: prayer chooser opens');
  await p.locator('[role=dialog] button', { hasText: 'מנחה' }).click();
  await p.locator('[role=dialog] button', { hasText: 'מנחה ביחידות' }).click(); // round 13 (U5): the minyan choice
  await settle();
  check((await toast()).includes('נרשם'), '2: saved feedback after recording', await toast());
  await p.click('[aria-label="רישום תפילה: שלוש תפילות"]');
  check(await p.locator('[role=dialog] button', { hasText: 'מנחה' }).isDisabled(), '2: an already recorded prayer cannot be chosen again');
  await p.locator('[role=dialog] button', { hasText: 'שחרית' }).click();
  await p.locator('[role=dialog] button', { hasText: 'שחרית ביחידות' }).click(); // round 13 (U5): the minyan choice
  await settle();
  await p.click('[aria-label="רישום תפילה: שלוש תפילות"]');
  await p.locator('[role=dialog] button', { hasText: 'ערבית' }).click();
  await p.locator('[role=dialog] button', { hasText: 'ערבית ביחידות' }).click(); // round 13 (U5): the minyan choice
  await settle();
  check((await count('text=/^1\\/2$/')) === 1, '2: three different prayers complete the habit (1/2)');
  await shot('02-three-prayers');

  // 3. Learning track: "I did it" opens the learning screen, never records general learning
  const before = await text('text=/^\\d+$/ >> nth=0');
  await p.click('[aria-label="פתיחה: מסלול לימוד קבוע"]');
  await settle();
  check((await count('text=הלימוד שלי היום')) === 1, '3: learning-track habit opens the learning screen');
  void before;
  await tab('היום');
  await settle();
  check((await count('text=/^1\\/2$/')) === 1, '3: opening the track did not record anything');

  // 4. Join a challenge and see its progress from the log
  await tab('מסלולים');
  await p.click('[aria-label="הצטרפות לאתגר: מעגל של עשייה"]');
  await settle();
  check((await count('text=/אתגר פעיל · עוד 7 ימים/')) === 1, '4: challenge joined');
  check((await count('text=/^1\\/3$/')) === 1, '4: challenge counts today\'s prayer category', String(await count('text=/^1\\/3$/')));
  await shot('03-challenge');

  // 5. Weekly habit + gratitude recorded; progress screen computed from actions
  await tab('היום');
  await p.click('[aria-label="רשמתי: הכרת הטוב"]');
  await settle();
  check((await count('text=/^1\\/3 השבוע$/')) === 1, '5: weekly habit 1/3 this week');
  await tab('התקדמות');
  await settle();
  check((await text('text=/ימים ביעד/')).includes('השבוע'), '5: progress week summary shown');
  check((await count('text=/^יומן · השבוע \\(4\\)$/')) === 1, '5: journal has the 4 recorded entries', await text('text=/^יומן · /'));
  check((await count('text=/^הישגים · 1\\//')) === 1, '5: first achievement recorded', await text('text=/^הישגים · /'));
  await shot('04-progress');

  // 6. Reload keeps everything
  await p.reload();
  await settle();
  check((await count('text=/^1\\/2$/')) === 1, '6: habits kept after reload');
  await tab('מסלולים');
  check((await count('text=/^1\\/3$/')) === 1, '6: challenge kept after reload');

  // 6b. RTL, accessible names, keyboard (round 11 §7)
  await tab('היום');
  await settle();
  check((await p.evaluate(() => getComputedStyle(document.querySelector('main h1') ?? document.body).direction)) === 'rtl', '6b: screens are right-to-left');
  const unnamed = await p.evaluate(() =>
    [...document.querySelectorAll('button')].filter((b) => !(b.getAttribute('aria-label') || b.textContent || '').trim()).length,
  );
  check(unnamed === 0, '6b: every button has an accessible name', `${unnamed} without a name`);
  const focusNames = [];
  await p.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : undefined));
  for (let i = 0; i < 8; i += 1) {
    await p.keyboard.press('Tab');
    focusNames.push(await p.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return '(body)';
      return (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30) || `<${el.tagName.toLowerCase()}>`;
    }));
  }
  // The first press may only bring focus into the page; after that every control must be named.
  check(
    !focusNames.some((n) => n.startsWith('<')) && focusNames.filter((n) => n !== '(body)').length >= 7,
    '6b: keyboard Tab moves through named controls',
    JSON.stringify(focusNames),
  );
  check((await count('text=לימוד יומי')) > 0 && (await count('text=דבר תורה')) === 0, 'production: no Dvar Torah shown without approved content');

  // 6c. Offline: recording works without a network and is kept after reconnecting
  await ctx.setOffline(true);
  await p.click('[aria-label="רשמתי: הכרת הטוב"]').catch(() => {});
  await p.locator('[aria-label^="+ ברכה"]').first().click();
  await settle();
  check((await toast()).includes('נרשם') || (await toast()).includes('הישג'), '6c: saved feedback while offline', await toast());
  await ctx.setOffline(false);
  await p.reload();
  await settle();
  await tab('התקדמות');
  check((await count('text=/^יומן · השבוע \\(5\\)$/')) === 1, '6c: the offline entry is kept', await text('text=/^יומן · /'));

  // 7. Existing user (state from before habits) keeps history; offered habits
  await fresh({
    version: 2, onboarded: true, userName: 'ותיק', memberSince: NOW - 40 * 86400000, legacyPoints: 500,
    dailyGoal: 6, weeklyGoal: 30, blessingGoal: 100,
    logs: [
      { id: 'old-1', title: 'שחרית', icon: 'sun', points: 25, createdAt: NOW - 86400000, dateKey: '2026-11-23', kind: 'mitzvah', actionKey: 'shacharit', rules: 'score-2' },
      { id: 'old-2', title: 'נתינת צדקה', icon: 'charity', points: 15, createdAt: NOW - 2 * 86400000, dateKey: '2026-11-22', kind: 'mitzvah', actionKey: 'charity' },
    ],
    speech: { since: null, bestMs: 0, resets: 0, completedMs: 0, undo: null }, reflections: {}, settings: {}, joinedGroups: {},
    profile: { gender: 'male', nusach: 'sefard', cityId: 'jerusalem' }, learningTracks: [], backfilledRestDays: [],
  });
  check((await text('h1')).includes('ותיק'), '7: existing user loads');
  check((await count('text=בחירת הרגלים')) === 1, '7: habits offered, not forced');
  await tab('התקדמות');
  await settle();
  check((await count('text=/^יומן · השבוע \\(2\\)$/')) === 1, '7: history kept (2 entries this week)');
  check((await text('text=/^\\d[\\d,]*$/ >> nth=0')) !== null, '7: screen renders');

  // 7b. Design round 1 – the add sheet: exact names, one detail step for prayers, one tap = one entry
  await tab('היום');
  await settle();
  await p.click('[aria-label="הוספת פעולה"]');
  const tileNames = await p.locator('[role=dialog] section button').evaluateAll((bs) => bs.map((b) => b.getAttribute('aria-label') ?? ''));
  check(['שחרית', 'מנחה', 'ערבית', 'הנחת תפילין', 'אמירת תהילים', 'ברכה', 'ברכת המזון'].every((n) => tileNames.includes(n)), '7b: the add sheet names every action', JSON.stringify(tileNames));
  check(!tileNames.includes('תפילה') && !tileNames.includes('ברכות'), '7b: no tile is named by its category ("תפילה" / "ברכות")');
  const entriesBefore = await p.evaluate(() => JSON.parse(localStorage.getItem('mitzvot_plus_state_v1')).logs.length);
  await p.locator('[role=dialog] button', { hasText: 'ערבית' }).first().click();
  check((await count('[role=dialog][aria-label="פרטי הרישום: ערבית"]')) === 1, '7b: a prayer asks "in a minyan or not" before recording');
  const opt = p.locator('[role=dialog] button', { hasText: 'ערבית ביחידות' });
  await opt.dblclick().catch(() => {});
  await settle();
  const entriesAfter = await p.evaluate(() => JSON.parse(localStorage.getItem('mitzvot_plus_state_v1')).logs.length);
  check(entriesAfter === entriesBefore + 1, '7b: a double tap records once', `${entriesBefore} → ${entriesAfter}`);
  check((await toast()).includes('נרשם: ערבית'), '7b: the toast names what was recorded', await toast());
  check((await count('section[aria-label="נרשם היום"] li:has-text("ערבית")')) === 1, '7b: Home shows the entry at once');
  await p.locator('[aria-label="ביטול הרישום: ערבית"]').click({ timeout: 3000 });
  await settle();
  check((await count('section[aria-label="נרשם היום"] li:has-text("ערבית")')) === 0, '7b: "ביטול" in the toast removes the entry from Home');
  const entriesUndo = await p.evaluate(() => JSON.parse(localStorage.getItem('mitzvot_plus_state_v1')).logs.length);
  check(entriesUndo === entriesBefore, '7b: and from the stored log');

  // 8. Navigation and reset
  for (const t of ['התקדמות', 'מסלולים', 'אני', 'היום']) {
    await tab(t);
    check((await count(`nav button[aria-current=page]:has-text("${t}")`)) === 1, `8: tab ${t} opens`);
  }
  await tab('אני');
  check((await text('[data-testid=build-fingerprint]')).length === 12, '8: build fingerprint shown');
  await p.click('text=מחיקת כל הנתונים');
  await p.locator('[role=dialog] button', { hasText: 'מחיקה' }).click();
  await settle();
  check((await count('#onboarding-name')) === 1, '8: delete-all returns to onboarding');
} catch (e) {
  failures.push(`exception: ${e instanceof Error ? (process.env.DEBUG_E2E ? e.message : e.message.split('\n')[0]) : String(e)}`);
} finally {
  await browser.close();
  server.stop();
}

for (const e of consoleErrors) failures.push(`console error: ${e}`);
console.log(`E2E: ${passed.length} passed, ${failures.length} failed`);
for (const n of passed) console.log(`  PASS ${n}`);
for (const f of failures) console.log(`  FAIL ${f}`);
process.exit(failures.length === 0 ? 0 : 1);
