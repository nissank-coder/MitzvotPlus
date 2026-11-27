// Round 14.1 – mobile acceptance scenarios of the review (§4 A–P), in the real app on a PRODUCTION
// build, in Chromium at 390×844 (not a phone: touch, TalkBack, system text size and the Android
// WebView are on the owner's checklist, docs/review-r14.1/ACCEPTANCE_HE.md).
//   A clean install          B upgrade of an existing user (main b0c7e22), nusach kept
//   C open / move / scroll / close the add sheet → nothing recorded
//   D a double tap records one entry      E reading, choosing a track, scrolling → nothing recorded
//   F one entry, its name, undo removes it and its effect, kept after reopening
//   G the first entry completing a habit and the goal keeps its name and undo
//   H the screenshot's ref (Kitzur 10) and today's ref     I the whole portion (daf, Chofetz Chaim)
//   J time limit and retry; a disconnect then a retry; closing while loading
//   K a late answer never replaces the text chosen now    L offline and never read: nothing recorded
//   M nusach: what the build has, said; no silent swap
//   + the catalog: hospitality and visiting the sick in the add sheet (not on Home); a deed recorded
//     in the add sheet shows as done in the mitzvah library (never recorded twice).
// N (blessing goal) and O (timer focus) are covered by round-13 U3 / U2 and round 1.1 R2 / R3.
// Sefaria is a local route here; the real answers are in docs/review-r14.1/evidence.
//   node scripts/e2e/round-14-1.mjs
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

const OUT = 'dist-r14-1';
const b = spawnSync('npx', ['vite', 'build', '--outDir', OUT, '--emptyOutDir'], { encoding: 'utf8' });
if (b.status !== 0) throw new Error(b.stderr);
const proc = spawn('npx', ['vite', 'preview', '--outDir', OUT, '--port', '4183', '--strictPort'], { stdio: 'ignore', detached: true });
const URL = 'http://localhost:4183';
for (let i = 0; i < 80; i += 1) {
  try {
    if ((await fetch(URL)).ok) break;
  } catch {}
  await new Promise((r) => setTimeout(r, 250));
}

const NOW = new Date('2026-11-26T20:00:00+02:00').getTime(); // the screenshot's day: Kitzur Shulchan Arukh 10
const DAY = 86400000;
const onboarded = (habits = [{ id: 'learn-daily', perWeek: 7 }], extra = {}) =>
  reducer(createFreshState(NOW - 6 * DAY), {
    type: 'completeOnboarding',
    payload: { userName: 'בודק', dailyGoal: 5, profile: { gender: 'male', cityId: 'jerusalem', ...extra }, dateKey: '2026-11-20', habits },
  });
const text = (label, n) => ({ he: Array.from({ length: n }, (_, i) => `${label} ${i + 1}`), heRef: label, heVersionTitle: 'Torat Emet 357', heLicense: 'Public Domain' });

const browser = await chromium.launch();
async function open(state, { sefaria, now = NOW } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Jerusalem', locale: 'he-IL' });
  const p = await ctx.newPage();
  p.setDefaultTimeout(8000);
  const calls = [];
  await ctx.route('https://www.sefaria.org/api/texts/**', async (route) => {
    const url = route.request().url();
    calls.push(url);
    const a = sefaria ? await sefaria(url, calls.length) : { status: 200, body: text('סעיף', 26) };
    if (a === 'abort') return route.abort('internetdisconnected');
    if (a === 'hang') return; // never answered (the reader's time limit or closing decides)
    if (a.delay) await new Promise((r) => setTimeout(r, a.delay));
    await route
      .fulfill({ status: a.status, contentType: 'application/json', body: JSON.stringify(a.body), headers: { 'access-control-allow-origin': '*' } })
      .catch(() => undefined); // the page may have gone
  });
  await p.addInitScript({ path: 'scripts/e2e/fakedate.js' });
  await p.goto(URL);
  await p.evaluate(([n, s]) => {
    localStorage.clear();
    localStorage.setItem('__fakeNow', String(n));
    if (s) localStorage.setItem('mitzvot_plus_state_v1', JSON.stringify(s));
  }, [now, state ?? null]);
  await p.reload();
  await p.waitForTimeout(700);
  return { p, ctx, calls };
}
const stored = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('mitzvot_plus_state_v1')));
const toast = async (p) => (await p.locator('[role=status]').filter({ has: p.locator('button[aria-label="סגירה"]') }).first().innerText().catch(() => '')).replace(/\s+/g, ' ');
async function block(name, fn) {
  try {
    await fn();
  } catch (e) {
    failures.push(`${name}: exception ${e.message.split('\n')[0]}`);
  }
}
const sheet = (p) => p.locator('[role=dialog]').last();
const openAdd = async (p) => {
  await p.click('[aria-label="הוספת פעולה"]');
  await sheet(p).waitFor();
};
const smallTargets = (p) =>
  p.evaluate(() =>
    [...document.querySelectorAll('button, a[href], input, [role=button]')]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && r.height < 44 && !el.closest('nav[aria-label="ניווט ראשי"]');
      })
      .map((el) => (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 30)),
  );
const learning = async (p) => {
  await p.click('[aria-label^="לימוד יומי"]');
  await p.locator('h1, h2', { hasText: 'לימוד יומי' }).first().waitFor();
};

try {
  // A – a clean install: normal buttons, nothing chosen and nothing recorded before an action.
  await block('A', async () => {
    const { p, ctx } = await open(null);
    const small1 = await smallTargets(p);
    const cont = await p.getByRole('button', { name: 'המשך', exact: true }).boundingBox();
    check(small1.length === 0 && cont && cont.height <= 72, 'A: the first screen – every control 44px or more, "המשך" a normal button', `${small1.join(', ')} · ${Math.round(cont?.height ?? 0)}px`);
    await p.fill('#onboarding-name', 'חדש');
    await p.click('text=המשך');
    const small2 = await smallTargets(p);
    check(small2.length === 0, 'A: the habits screen – every control 44px or more', small2.join(', '));
    check(((await stored(p))?.logs?.length ?? 0) === 0, 'A: nothing recorded during onboarding');
    await p.locator('button[aria-pressed]', { hasText: 'הכרת הטוב' }).first().click();
    await p.click('text=/המשך \\(1 נבחרו\\)/');
    await p.click('text=מתחילים');
    await p.waitForTimeout(700);
    const s = await stored(p);
    check(s.logs.length === 0 && s.learningTracks.length === 0 && !s.learningTracksChosen, 'A: after onboarding – no entry, no learning track chosen for the user', `logs ${s.logs.length}, tracks ${s.learningTracks.length}`);
    await ctx.close();
  });

  // B – an existing user of main, upgraded: history, habits, goals and the nusach kept.
  await block('B', async () => {
    const fixture = JSON.parse(fs.readFileSync('scripts/e2e/fixtures/existing-user-main-b0c7e22.json', 'utf8'));
    fixture.profile = { ...fixture.profile, nusach: 'ashkenaz' };
    const { p, ctx } = await open(fixture);
    const s = await stored(p);
    check(s.logs.length === fixture.logs.length, 'B: every entry of the history is kept', `${s.logs.length}/${fixture.logs.length}`);
    check(JSON.stringify(s.habits) === JSON.stringify(fixture.habits), 'B: the habits and their frequencies are kept');
    check(s.blessingGoal === fixture.blessingGoal && s.dailyGoal === fixture.dailyGoal, 'B: the goals are kept');
    check(s.profile.nusach === 'ashkenaz', 'B: the nusach chosen (Ashkenaz) is kept');
    // M – the siddur says what this build has; the choice is not swapped silently.
    await p.locator('button', { hasText: 'זמנים, סידור ומצוות היום לפי הלוח' }).click();
    await p.getByRole('button', { name: 'סידור', exact: true }).click();
    const note = await p.locator('[data-testid="siddur-nusach"]').innerText();
    check(/הנוסח שבחרת: אשכנז/.test(note) && /ספרד/.test(note), 'M: Ashkenaz chosen – the siddur says it shows Sefard here, and why', note.replace(/\s+/g, ' ').slice(0, 120));
    check((await p.locator('a', { hasText: 'סידור אשכנז בספריא' }).count()) === 1, 'M: …with a marked outside link to Ashkenaz');
    check((await stored(p)).profile.nusach === 'ashkenaz', 'M: opening the siddur does not change the choice');
    await ctx.close();
  });

  await block('M-edot', async () => {
    const { p, ctx } = await open(onboarded(undefined, { nusach: 'edot' }));
    await p.locator('button', { hasText: 'זמנים, סידור ומצוות היום לפי הלוח' }).click();
    await p.getByRole('button', { name: 'סידור', exact: true }).click();
    const note = await p.locator('[data-testid="siddur-nusach"]').innerText();
    check(/עדות המזרח/.test(note) && (await p.locator('a', { hasText: 'סידור עדות המזרח בספריא' }).count()) === 1, 'M: Edot HaMizrach chosen – said, with an outside link, not called a full nusach');
    await ctx.close();
  });

  // C – opening the add sheet, moving inside it, scrolling and closing records nothing.
  await block('C', async () => {
    const { p, ctx } = await open(onboarded());
    await openAdd(p);
    await sheet(p).evaluate((el) => {
      const sc = [...el.querySelectorAll('*')].find((x) => x.scrollHeight > x.clientHeight + 10) ?? el;
      sc.scrollTop = sc.scrollHeight;
    });
    await p.waitForTimeout(300);
    await sheet(p).locator('button', { hasText: 'שחרית' }).first().click();
    await p.locator('[role=dialog][aria-label="פרטי הרישום: שחרית"]').waitFor();
    await p.click('[aria-label="חזרה לרשימה"]');
    await sheet(p).locator('button[aria-label="סגירה"]').click();
    await p.waitForTimeout(400);
    check((await stored(p)).logs.length === 0, 'C: open, scroll, open a prayer, back, close – nothing recorded');
    await ctx.close();
  });

  // D – a double tap on an add-sheet item records it once, and nothing under the sheet.
  await block('D', async () => {
    const { p, ctx } = await open(onboarded());
    await openAdd(p);
    await sheet(p).locator('button', { hasText: 'נתינת צדקה' }).first().dblclick();
    await p.waitForTimeout(900);
    const logs = (await stored(p)).logs;
    check(logs.length === 1 && logs[0].actionKey === 'charity', 'D: a double tap on "נתינת צדקה" records one entry, nothing else', logs.map((l) => l.actionKey).join(','));
    await ctx.close();
  });

  // E – choosing a track, opening, reading to the end and closing records nothing.
  await block('E', async () => {
    const { p, ctx } = await open(onboarded(), { sefaria: () => ({ status: 200, body: text('הלכה', 173) }) });
    await learning(p);
    await p.click('[aria-label="הוספת מסלול: הלכה יומית"]');
    await p.click('[aria-label="קריאה: הלכה יומית"]');
    await p.locator('.reader-text').first().waitFor();
    for (const re of [/המשך הקריאה \(113/, /המשך הקריאה \(53/]) await p.locator('button', { hasText: re }).click();
    await p.locator('.reader-text').last().scrollIntoViewIfNeeded();
    const seen = await p.locator('.reader-text').count();
    await p.locator('[role=dialog] button[aria-label="סגירה"]').click();
    await p.waitForTimeout(400);
    const s = await stored(p);
    check(seen === 173 && s.logs.length === 0, 'E: a track chosen, read to the end (173/173) and closed – no entry, no "למדתי"', `seen ${seen}, logs ${s.logs.length}`);
    await ctx.close();
  });

  // F – one entry, its name and undo; undo removes it and its effect; kept after reopening.
  await block('F', async () => {
    const { p, ctx } = await open(onboarded([{ id: 'chesed', perWeek: 7 }, { id: 'gratitude', perWeek: 7 }]));
    await openAdd(p);
    await sheet(p).locator('button', { hasText: 'הכרת הטוב' }).first().click();
    await p.waitForTimeout(900);
    check(/נרשם: הכרת הטוב/.test(await toast(p)) && (await stored(p)).logs.length === 1, 'F: one explicit entry, named in the message');
    await p.reload();
    await p.waitForTimeout(800);
    check((await stored(p)).logs.length === 1 && (await p.locator('text=/^1\\/2$/').count()) === 1, 'F: after reopening – the entry and its progress (1/2) are there');
    await p.waitForTimeout(4500);
    await openAdd(p);
    await sheet(p).locator('button', { hasText: 'מעשה חסד' }).first().click();
    await p.waitForTimeout(700);
    const before = (await stored(p)).points ?? null;
    check((await p.locator('text=/^2\\/2$/').count()) === 1, 'F: the second habit done – 2/2');
    await p.locator('[role=status] button[aria-label^="ביטול"]').click();
    await p.waitForTimeout(700);
    const s = await stored(p);
    check(s.logs.length === 1 && s.logs[0].actionKey === 'gratitude' && (await p.locator('text=/^1\\/2$/').count()) === 1, 'F: undo removes that entry and its effect (back to 1/2)', `${s.logs.map((l) => l.actionKey)} ${before}`);
    await p.reload();
    await p.waitForTimeout(800);
    check((await stored(p)).logs.length === 1 && (await p.locator('text=/^1\\/2$/').count()) === 1, 'F: after reopening – the undone entry stays undone');
    await ctx.close();
  });

  // G – the very first entry completes the habit and the goal: still named, still undoable.
  await block('G', async () => {
    const { p, ctx } = await open(onboarded([{ id: 'gratitude', perWeek: 7 }]));
    await openAdd(p);
    await sheet(p).locator('button', { hasText: 'הכרת הטוב' }).first().click();
    await p.waitForTimeout(900);
    const t = await toast(p);
    const undo = await p.locator('[role=status] button[aria-label^="ביטול"]').count();
    check(/הכרת הטוב/.test(t) && undo === 1, 'G: first entry + habit + daily goal – the message keeps the name and "ביטול"', t);
    await p.locator('[role=status] button[aria-label^="ביטול"]').click();
    await p.waitForTimeout(700);
    check((await stored(p)).logs.length === 0 && (await p.locator('text=/^0\\/1$/').count()) === 1, 'G: undo after the goal – no entry, back to 0/1');
    await ctx.close();
  });

  // H, I – which text is asked for: the screenshot's day and today; the whole daf and the whole portion.
  await block('H', async () => {
    const st = onboarded();
    st.learningTracks = ['dailyHalacha', 'dafyomi', 'chofetzchaim'];
    st.learningTracksChosen = true;
    const { p, ctx, calls } = await open(st);
    await learning(p);
    await p.click('[aria-label="קריאה: הלכה יומית"]');
    await p.locator('.reader-text').first().waitFor();
    check(calls.some((u) => u.includes('Kitzur_Shulchan_Arukh.10')), 'H: 26.11.2026 – the reader asks for Kitzur Shulchan Arukh 10 (the screenshot)');
    await p.locator('[role=dialog] button[aria-label="סגירה"]').click();
    await p.click('[aria-label="קריאה: דף יומי"]');
    await p.locator('.reader-text').first().waitFor();
    check(calls.some((u) => /\.\d+a-\d+b\?/.test(decodeURIComponent(u))), 'I: the daf yomi is asked for whole – both sides', calls.at(-1));
    await p.locator('[role=dialog] button[aria-label="סגירה"]').click();
    await p.click('[aria-label="קריאה: חפץ חיים יומי"]');
    await p.locator('.reader-text').first().waitFor();
    const cc = decodeURIComponent(calls.at(-1));
    check(/Chofetz_Chaim[^?]*-\d+\?/.test(cc) || /Chofetz_Chaim/.test(cc), 'I: the Chofetz Chaim portion is asked for as a range when it spans one', cc.slice(30, 120));
    await ctx.close();
  });
  await block('H-today', async () => {
    const today = Date.UTC(2026, 10, 27, 10);
    const st = onboarded();
    st.learningTracks = ['dailyHalacha'];
    st.learningTracksChosen = true;
    const { p, ctx, calls } = await open(st, { now: today });
    await learning(p);
    await p.click('[aria-label="קריאה: הלכה יומית"]');
    await p.locator('.reader-text').first().waitFor();
    const siman = (Math.floor(Date.UTC(2026, 10, 27) / DAY) % 221) + 1;
    check(calls.some((u) => u.includes(`Kitzur_Shulchan_Arukh.${siman}?`)), `H: 27.11.2026 – today's unit (Kitzur ${siman}) is the one asked for`);
    await ctx.close();
  });

  // J – the time limit then a retry that passes; a disconnect then a retry; closing while loading.
  await block('J', async () => {
    const st = onboarded();
    st.learningTracks = ['dailyHalacha'];
    st.learningTracksChosen = true;
    const { p, ctx, calls } = await open(st, { sefaria: (u, n) => (n === 1 ? 'hang' : { status: 200, body: text('אחרי המתנה', 12) }) });
    await learning(p);
    await p.click('[aria-label="קריאה: הלכה יומית"]');
    const shown = await p.locator('.reader-text').first().waitFor({ timeout: 25000 }).then(() => true, () => false);
    check(shown && calls.length === 2, 'J: no answer in 12 s – a second attempt, and the text comes', `${calls.length} requests`);
    await ctx.close();
  });
  await block('J-disconnect', async () => {
    const st = onboarded();
    st.learningTracks = ['dailyHalacha'];
    st.learningTracksChosen = true;
    const { p, ctx, calls } = await open(st, { sefaria: (u, n) => (n === 1 ? 'abort' : { status: 200, body: text('אחרי ניתוק', 9) }) });
    await learning(p);
    await p.click('[aria-label="קריאה: הלכה יומית"]');
    const shown = await p.locator('.reader-text').first().waitFor({ timeout: 12000 }).then(() => true, () => false);
    check(shown && calls.length === 2, 'J: the connection drops – a retry, and the text comes');
    await ctx.close();
  });
  await block('J-cancel', async () => {
    const st = onboarded();
    st.learningTracks = ['dailyHalacha'];
    st.learningTracksChosen = true;
    const { p, ctx } = await open(st, { sefaria: () => 'hang' });
    const errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    await learning(p);
    await p.click('[aria-label="קריאה: הלכה יומית"]');
    await p.locator('[role=status]', { hasText: 'טוען את הטקסט' }).waitFor();
    await p.locator('[role=dialog] button[aria-label="סגירה"]').click();
    await p.waitForTimeout(13500);
    check(errors.length === 0 && (await p.locator('[role=alert]').count()) === 0 && (await stored(p)).logs.length === 0, 'J: closed while loading – no error later, nothing recorded', errors.join(';'));
    await ctx.close();
  });

  // K – a late answer for the text closed never replaces the text opened now.
  await block('K', async () => {
    const st = onboarded();
    st.learningTracks = ['dailyHalacha', 'chofetzchaim'];
    st.learningTracksChosen = true;
    const { p, ctx } = await open(st, {
      sefaria: (u) => (u.includes('Kitzur') ? { status: 200, body: text('טקסט ראשון שהגיע באיחור', 5), delay: 2500 } : { status: 200, body: text('הטקסט שנבחר עכשיו', 5) }),
    });
    await learning(p);
    await p.click('[aria-label="קריאה: הלכה יומית"]');
    await p.waitForTimeout(300);
    await p.locator('[role=dialog] button[aria-label="סגירה"]').click();
    await p.click('[aria-label="קריאה: חפץ חיים יומי"]');
    await p.locator('.reader-text').first().waitFor();
    await p.waitForTimeout(3500);
    const body = await p.locator('[role=dialog]').last().innerText();
    check(/הטקסט שנבחר עכשיו/.test(body) && !/שהגיע באיחור/.test(body), 'K: the late answer of the closed text does not replace the open one');
    await ctx.close();
  });

  // L – offline, a text never read: a clear state, and it is not recorded as learning.
  await block('L', async () => {
    const st = onboarded();
    st.learningTracks = ['dailyHalacha'];
    st.learningTracksChosen = true;
    const { p, ctx } = await open(st, { sefaria: () => 'abort' });
    await learning(p);
    await ctx.setOffline(true);
    await p.click('[aria-label="קריאה: הלכה יומית"]');
    const alert = await p.locator('[role=alert]').innerText({ timeout: 15000 }).catch(() => '');
    check(/אין חיבור/.test(alert) && (await stored(p)).logs.length === 0, 'L: offline and never read – "no connection", nothing recorded', alert.slice(0, 80));
    await p.locator('summary', { hasText: 'פרטים טכניים' }).click();
    const env = await p.locator('[data-testid="reader-env"]').innerText().catch(() => '');
    check(/build \S+ · web · Chrome \d+ · offline/.test(env), 'L: the technical details say which build, shell and engine (for a phone screenshot)', env);
    await ctx.close();
  });

  // Catalog – the two chesed actions in the add sheet, not on Home; privacy unchanged.
  await block('catalog', async () => {
    const { p, ctx } = await open(onboarded());
    const onHome = await p.locator('main button', { hasText: /הכנסת אורחים|ביקור חולים/ }).count();
    await openAdd(p);
    const inSheet = await sheet(p).locator('section[aria-label="חסד"] button', { hasText: /^(הכנסת אורחים|ביקור חולים)/ }).count();
    check(onHome === 0 && inSheet === 2, 'catalog: "הכנסת אורחים" and "ביקור חולים" in the add sheet under חסד – not added to Home', `home ${onHome}, sheet ${inSheet}`);
    await sheet(p).locator('button', { hasText: 'ביקור חולים' }).first().click();
    await p.waitForTimeout(800);
    const l = (await stored(p)).logs;
    // Every entry carries the calendar context (city, time zone); nothing about the person visited.
    const extra = Object.keys(l[0] ?? {}).filter((k) => !['id', 'title', 'icon', 'points', 'createdAt', 'dateKey', 'kind', 'actionKey', 'recordedAt', 'context', 'rules', 'capped'].includes(k));
    check(l.length === 1 && l[0].actionKey === 'visitSick' && l[0].title === 'ביקור חולים' && extra.length === 0, 'catalog: recorded as the existing action, with no names or details', extra.join(','));
    await ctx.close();
  });

  // Mitzvah library – a deed recorded in the add sheet shows as done there; learning stays separate.
  await block('mitzvot', async () => {
    const { p, ctx } = await open(onboarded());
    await openAdd(p);
    await sheet(p).locator('button', { hasText: 'הנחת תפילין' }).first().click();
    await p.waitForTimeout(800);
    await p.click('[aria-label="מסלולים"]');
    await p.locator('button', { hasText: 'לימוד מצווה ביום' }).first().click();
    const scope = await p.locator('[data-testid="mitzvot-scope"]').innerText();
    check(/מבחר מצוות ללימוד: 55 פריטים זמינים/.test(scope) && !/מתוך 613/.test(scope), 'mitzvot: a partial library – no "of 613" without an approved mapping', scope.replace(/\s+/g, ' ').slice(0, 90));
    await p.locator('button[aria-expanded]', { hasText: 'תפילין של יד' }).click();
    const done = p.locator('button', { hasText: 'הנחת תפילין – נרשם היום' });
    check((await done.count()) === 1 && (await done.isDisabled()), 'mitzvot: tefillin recorded in the add sheet – "נרשם היום" in the library, not recordable twice');
    await p.locator('button[aria-label="למדתי על המצווה: תפילין של יד"]').click();
    await p.waitForTimeout(700);
    const logs = (await stored(p)).logs;
    check(logs.filter((x) => x.actionKey === 'tefillin').length === 1 && logs.some((x) => x.actionKey === 'mitzvahStudy'), 'mitzvot: learning about it is a separate entry; the deed is still one');
    await ctx.close();
  });
} finally {
  await browser.close();
  try {
    process.kill(-proc.pid);
  } catch {}
  fs.rmSync(OUT, { recursive: true, force: true });
}

for (const n of passed) console.log(`  PASS ${n}`);
for (const f of failures) console.log(`  FAIL ${f}`);
console.log(`Round 14.1: ${passed.length} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
