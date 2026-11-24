/**
 * DRAFT calendar-policy fixtures (CALENDAR_POLICY.version). They pin the CURRENT engineering policy
 * so changes are deliberate. Times are sanity-ranged, not rabbinically approved (decisions D05/D06).
 */
import { describe, expect, it } from 'vitest';
import { CityOption, cityById } from '../data/locations';
import { CALENDAR_POLICY, calendarContextOf, cityDateKey, getRestWindow, getZmanim, recentRestDays } from '../lib/jewishCalendar';
import { createFreshState, reducer } from '../store/state';

const jerusalem = cityById('jerusalem');
const ny = cityById('new-york');
const london = cityById('london');
const la = cityById('los-angeles');
const tromso: CityOption = { id: 'test-tromso', name: 'Tromsø (test)', latitude: 69.6492, longitude: 18.9553, elevation: 0, tzid: 'Europe/Oslo', il: false, candleMins: 18 };

const MIN = 60_000;
const localHM = (d: Date, tz: string) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
const around = (key: string, city: CityOption, which: 'candleLighting' | 'tzeit') => {
  const t = getZmanim(key, city)[which];
  if (!t) throw new Error(`no ${which} for ${key}`);
  return { before: new Date(t.getTime() - MIN), after: new Date(t.getTime() + MIN), at: t };
};

describe('policy metadata', () => {
  it('is versioned and marked as a draft', () => {
    expect(CALENDAR_POLICY.version).toMatch(/^draft-/);
    expect(CALENDAR_POLICY.status).toBe('DRAFT_NOT_RABBINICALLY_APPROVED');
    expect(getRestWindow(new Date('2026-11-25T12:00:00Z'), jerusalem).policyVersion).toBe(CALENDAR_POLICY.version);
  });

  it('records the policy and city snapshot on every new event', () => {
    const s = reducer(createFreshState(0), {
      type: 'addAction',
      payload: { key: 'charity', now: Date.UTC(2026, 10, 24, 10), dateKey: '2026-11-24', context: calendarContextOf(ny) },
    });
    expect(s.logs[0]?.context).toEqual({ policyVersion: CALENDAR_POLICY.version, cityId: 'new-york', tzid: 'America/New_York', il: false, candleMins: 18 });
    expect(s.logs[0]?.dateKey).toBe('2026-11-24');
    expect(s.logs[0]?.recordedAt).toBe(Date.UTC(2026, 10, 24, 10));
  });
});

describe('day boundary in the city time zone', () => {
  it('uses the city date, not the device date', () => {
    // 02:00 Sunday in Jerusalem is still Saturday afternoon in Los Angeles.
    const at = new Date('2026-11-29T02:00:00+02:00');
    expect(cityDateKey(at, 'Asia/Jerusalem')).toBe('2026-11-29');
    expect(cityDateKey(at, la.tzid)).toBe('2026-11-28');
  });

  it('a traveller whose city is Los Angeles is still in Shabbat', () => {
    const at = new Date('2026-11-29T02:00:00+02:00'); // Sat 16:00 in LA, before tzeit 17:24
    const w = getRestWindow(at, la);
    expect(w.active).toBe(true);
    expect(w.dateKeys).toEqual(['2026-11-28']);
    expect(localHM(w.endsAt!, la.tzid)).toBe('17:24');
  });
});

describe('Shabbat across daylight-saving changes', () => {
  const cases: Array<[CityOption, string, string, string, string]> = [
    // city, Friday, Saturday, expected candle-lighting range (local HH:MM), expected tzeit range
    [ny, '2026-10-30', '2026-10-31', '17:3', '18:3'], // EDT, before US change (Nov 1)
    [ny, '2026-11-06', '2026-11-07', '16:2', '17:2'], // EST, after the change
    [london, '2026-10-23', '2026-10-24', '17:3', '18:3'], // BST, before UK change (Oct 25)
  ];
  for (const [city, fri, sat, candleStart, tzeitStart] of cases) {
    it(`${city.id} ${fri}: lock opens at candle lighting and closes at tzeit`, () => {
      const c = around(fri, city, 'candleLighting');
      const t = around(sat, city, 'tzeit');
      expect(localHM(c.at, city.tzid).startsWith(candleStart)).toBe(true);
      expect(localHM(t.at, city.tzid).startsWith(tzeitStart)).toBe(true);
      expect(getRestWindow(c.before, city).active).toBe(false);
      expect(getRestWindow(c.after, city).active).toBe(true);
      expect(getRestWindow(t.before, city).active).toBe(true);
      expect(getRestWindow(t.after, city).active).toBe(false);
      expect(recentRestDays(t.after, city)).toEqual([sat]);
    });
  }

  it('the US clock change itself (Sunday 1 Nov 2026 01:30 happens twice) is not a rest day', () => {
    expect(getRestWindow(new Date('2026-11-01T05:30:00Z'), ny).active).toBe(false);
    expect(getRestWindow(new Date('2026-11-01T06:30:00Z'), ny).active).toBe(false);
  });
});

describe('holidays adjacent to Shabbat', () => {
  it('Pesach 2027 in New York is one three-day run (Thu–Sat)', () => {
    const c = around('2027-04-21', ny, 'candleLighting');
    const w = getRestWindow(c.after, ny);
    expect(w.active).toBe(true);
    expect(w.dateKeys).toEqual(['2027-04-22', '2027-04-23', '2027-04-24']);
    // Friday (second day) is still locked, with no gap before Shabbat.
    expect(getRestWindow(new Date('2027-04-23T22:00:00Z'), ny).active).toBe(true);
    const t = around('2027-04-24', ny, 'tzeit');
    expect(getRestWindow(t.after, ny).active).toBe(false);
    expect(recentRestDays(t.after, ny)).toEqual(['2027-04-22', '2027-04-23', '2027-04-24']);
  });

  it('Pesach 2027 in Jerusalem: Thursday, an open Friday, then Shabbat', () => {
    expect(getRestWindow(new Date('2027-04-22T10:00:00+03:00'), jerusalem).dateKeys).toEqual(['2027-04-22']);
    expect(getRestWindow(new Date('2027-04-23T10:00:00+03:00'), jerusalem).active).toBe(false);
    expect(getRestWindow(new Date('2027-04-24T10:00:00+03:00'), jerusalem).dateKeys).toEqual(['2027-04-24']);
  });

  it('Rosh Hashana 2027 (Sat–Sun) is one run everywhere', () => {
    const c = around('2027-10-01', jerusalem, 'candleLighting');
    expect(getRestWindow(c.after, jerusalem).dateKeys).toEqual(['2027-10-02', '2027-10-03']);
  });
});

describe('unknown boundary times', () => {
  it('extreme latitude without tzeit: whole civil rest day locked and marked uncertain', () => {
    // Midsummer Shabbat in Tromsø: the sun does not set, so tzeit cannot be computed.
    expect(getZmanim('2027-06-19', tromso).tzeit).toBeNull();
    const w = getRestWindow(new Date('2027-06-19T12:00:00+02:00'), tromso);
    expect(w).toMatchObject({ active: true, uncertain: true, endsAt: null, dateKeys: ['2027-06-19'] });
    // The next civil day opens again, and backfill is offered.
    const sunday = new Date('2027-06-20T09:00:00+02:00');
    expect(getRestWindow(sunday, tromso).active).toBe(false);
    expect(recentRestDays(sunday, tromso)).toEqual(['2027-06-19']);
  });
});

describe('Shabbat and Yom Tov: the app stays active (D05, 2026-11-24)', async () => {
  const { buildTodayPlan } = await import('../lib/todayPlan');
  const { getDayInfo } = await import('../lib/jewishCalendar');

  it('Shabbat shows the day’s mitzvot instead of an empty plan', () => {
    const info = getDayInfo('2026-11-28', true);
    const plan = buildTodayPlan(info, getZmanim('2026-11-28', jerusalem), 'male', []);
    const keys = plan.map((p) => p.key);
    expect(keys).toEqual(expect.arrayContaining(['kiddush', 'shabbatMeal', 'shacharit', 'musaf', 'mincha', 'havdalah']));
    expect(plan.find((p) => p.key === 'shabbatMeal')?.required).toBe(3);
    expect(keys).not.toContain('tefillin');
  });

  it('Havdalah only on the last day of a run (Pesach Thursday before Shabbat abroad)', () => {
    const thu = getDayInfo('2027-04-22', false);
    expect(buildTodayPlan(thu, getZmanim('2027-04-22', ny), 'male', []).map((p) => p.key)).not.toContain('havdalah');
    const sat = getDayInfo('2027-04-24', false);
    expect(buildTodayPlan(sat, getZmanim('2027-04-24', ny), 'male', []).map((p) => p.key)).toContain('havdalah');
  });
});
