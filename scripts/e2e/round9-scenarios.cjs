// Round 9 acceptance scenarios on a running build (URL arg 1), screenshots into dir arg 2.
const { chromium } = require('playwright');
const URL = process.argv[2] || 'http://localhost:4173';
const OUT = process.argv[3] || '.';
const TAG = process.argv[4] || 'prod';
const NOW = new Date('2026-11-24T10:00:00+02:00').getTime(); // Tuesday, Jerusalem

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Jerusalem', locale: 'he-IL', deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await p.addInitScript({ path: __dirname + '/fakedate.js' });
  await p.goto(URL);
  await p.evaluate((n) => { localStorage.clear(); localStorage.setItem('__fakeNow', String(n)); }, NOW);
  await p.reload();
  await p.waitForTimeout(600);
  const out = { tag: TAG };
  const shot = (name, full = true) => p.screenshot({ path: `${OUT}/${TAG}-${name}.png`, fullPage: full });
  const toast = async () => (await p.locator('[role=status]').first().innerText({ timeout: 4000 }).catch(() => null))?.replace(/\s+/g, ' ');
  const tab = (label) => p.locator('nav button', { hasText: label }).click();

  // 1. New user picks three habits
  await p.fill('#onboarding-name', 'בודק');
  await shot('01-onboarding-name', false);
  await p.click('text=המשך');
  for (const h of ['תפילה אחת ביום', 'לימוד יומי', 'מעשה חסד']) await p.locator('button[aria-pressed]', { hasText: h }).first().click();
  await shot('02-onboarding-habits', false);
  await p.click('text=/המשך \\(3 נבחרו\\)/');
  await p.click('text=מתחילים');
  await p.waitForTimeout(500);
  out.s1_goal = await p.locator('text=/0\\/3/').first().innerText().catch(() => null);
  out.s1_habits = await p.locator('ul li span.font-bold').allInnerTexts();
  await shot('03-home-new-user');

  // 2. First habit → progress + feedback after save
  await p.click('[aria-label="רשמתי: תפילה אחת ביום"]');
  await p.waitForTimeout(700);
  out.s2_toast = await toast();
  out.s2_ring = await p.locator('text=/1\\/3/').first().innerText().catch(() => null);
  await shot('04-home-first-habit', false);

  // 3. Join a challenge and see progress
  await tab('מסלולים');
  await p.waitForTimeout(300);
  await shot('05-tracks-before-join');
  await p.click('[aria-label="הצטרפות לאתגר: זמן לתורה"]');
  await p.waitForTimeout(300);
  out.s3_joined = await p.locator('text=/אתגר פעיל/').first().innerText().catch(() => null);
  await tab('היום');
  await p.click('[aria-label="רשמתי: לימוד יומי"]');
  await p.waitForTimeout(700);
  out.s3_toast = await toast();
  await tab('מסלולים');
  await p.waitForTimeout(300);
  out.s3_progress = await p.locator('text=/^1\\/3$/').first().innerText().catch(() => null);
  await shot('06-tracks-challenge-progress');

  // 4. Complete the daily goal → goal feedback; achievement recorded
  await tab('היום');
  await p.click('[aria-label="רשמתי: מעשה חסד"]');
  await p.waitForTimeout(800);
  out.s4_toast = await toast();
  out.s4_goal = await p.locator('text=היעד הושלם. יישר כוח').count();
  await shot('07-home-goal-done', false);

  // 5. Progress screen computed from the user's actions
  await tab('התקדמות');
  await p.waitForTimeout(400);
  out.s5_week = await p.locator('text=/ימים ביעד/').first().innerText().catch(() => null);
  out.s5_streaks = await p.locator('div.grid.grid-cols-3 span.text-\\[22px\\]').allInnerTexts();
  out.s5_awards = await p.locator('text=/^הישגים · /').first().innerText().catch(() => null);
  await shot('08-progress-week');
  await p.click('[role=tab]:has-text("היום")');
  await p.waitForTimeout(200);
  await shot('09-progress-day', false);

  // 6. Close and reopen → everything kept
  await p.reload();
  await p.waitForTimeout(800);
  out.s6_home_after_reload = await p.locator('text=/3\\/3/').first().innerText().catch(() => null);
  await tab('מסלולים');
  await p.waitForTimeout(300);
  out.s6_challenge_after_reload = await p.locator('text=/^1\\/3$/').first().innerText().catch(() => null);
  await tab('התקדמות');
  await p.waitForTimeout(300);
  out.s6_awards_after_reload = await p.locator('text=/^הישגים · /').first().innerText().catch(() => null);

  // About / build identification
  await tab('אני');
  await p.waitForTimeout(300);
  out.about = (await p.locator('[aria-label="אודות האפליקציה"]').innerText().catch(() => '')).replace(/\s+/g, ' ');
  await p.locator('[aria-label="אודות האפליקציה"]').scrollIntoViewIfNeeded();
  await shot('10-me-about', false);

  // 7. Existing user (saved before round 9) keeps history after the upgrade
  const legacy = {
    version: 2, onboarded: true, userName: 'ותיק', memberSince: NOW - 40 * 86400000, legacyPoints: 500,
    dailyGoal: 6, weeklyGoal: 30, blessingGoal: 100,
    logs: [
      { id: 'old-1', title: 'שחרית', icon: 'sun', points: 25, createdAt: NOW - 86400000, dateKey: '2026-11-23', kind: 'mitzvah', actionKey: 'shacharit', rules: 'score-2' },
      { id: 'old-2', title: 'נתינת צדקה', icon: 'charity', points: 15, createdAt: NOW - 2 * 86400000, dateKey: '2026-11-22', kind: 'mitzvah', actionKey: 'charity' },
    ],
    speech: { since: null, bestMs: 0, resets: 0, completedMs: 0, undo: null }, reflections: {}, settings: {},
    joinedGroups: {}, profile: { gender: 'male', nusach: 'sefard', cityId: 'jerusalem' }, learningTracks: [], backfilledRestDays: [],
    savedContent: [], goalHistory: [{ from: '0000-00-00', dailyGoal: 6, weeklyGoal: 30, blessingGoal: 100 }],
    locationHistory: [{ from: '0000-00-00', cityId: 'jerusalem' }],
  };
  await p.evaluate(([s, n]) => { localStorage.clear(); localStorage.setItem('__fakeNow', String(n)); localStorage.setItem('mitzvot_plus_state_v1', JSON.stringify(s)); }, [legacy, NOW]);
  await p.reload();
  await p.waitForTimeout(800);
  out.s7_name = await p.locator('h1').first().innerText();
  out.s7_offer = await p.locator('text=בחירת הרגלים').count();
  out.s7_points = await p.locator('text=/נק׳ היום|פעולות שונות/').first().innerText().catch(() => null);
  await shot('11-existing-user-home', false);
  await tab('התקדמות');
  await p.click('[role=tab]:has-text("השבוע")');
  await p.waitForTimeout(300);
  out.s7_journal = await p.locator('text=/^יומן · /').first().innerText().catch(() => null);
  await shot('12-existing-user-progress');

  out.errors = errors;
  console.log(JSON.stringify(out, null, 1));
  await b.close();
})();
