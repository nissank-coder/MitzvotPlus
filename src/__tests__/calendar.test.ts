import { describe, expect, it } from 'vitest';
import { cityById } from '../data/locations';
import { getDayInfo, getRestWindow, getZmanim, recentRestDays, upcomingHolidays } from '../lib/jewishCalendar';

const jerusalem = cityById('jerusalem');
const ny = cityById('new-york');
// Jerusalem is UTC+2 in winter.
const il = (iso: string) => new Date(`${iso}+02:00`);

describe('day info', () => {
  it('knows the Hebrew date and parsha', () => {
    const info = getDayInfo('2026-11-23', true);
    expect(info.hebrewDate).toContain('כסלו');
    expect(info.parsha).toContain('וישלח');
    expect(info.isRestDay).toBe(false);
  });

  it('knows Chanukah candles', () => {
    expect(getDayInfo('2026-12-06', true).chanukahCandles).toBe(3);
  });

  it('marks Friday as erev Shabbat', () => {
    const fri = getDayInfo('2026-11-27', true);
    expect(fri.isErevRest).toBe(true);
    expect(getDayInfo('2026-11-28', true).isShabbat).toBe(true);
  });

  it('counts the Omer for the coming night', () => {
    // 2027: Pesach starts 22 April (15 Nisan). First night of Omer = evening of 22 April.
    expect(getDayInfo('2027-04-22', true).omerDay).toBe(1);
    expect(getDayInfo('2027-04-23', true).omerDay).toBe(2);
  });

  it('second day Yom Tov only in the diaspora', () => {
    // 2027-04-23 = 16 Nisan
    expect(getDayInfo('2027-04-23', true).isYomTov).toBe(false);
    expect(getDayInfo('2027-04-23', false).isYomTov).toBe(true);
  });
});

describe('Shabbat window', () => {
  it('is inactive on a weekday', () => {
    expect(getRestWindow(il('2026-11-25T12:00:00'), jerusalem).active).toBe(false);
  });

  it('starts at candle lighting on Friday', () => {
    const candle = getZmanim('2026-11-27', jerusalem).candleLighting!;
    expect(getRestWindow(new Date(candle.getTime() - 60_000), jerusalem).active).toBe(false);
    const w = getRestWindow(new Date(candle.getTime() + 60_000), jerusalem);
    expect(w.active).toBe(true);
    expect(w.dateKeys).toEqual(['2026-11-28']);
    expect(w.title).toBe('שבת');
  });

  it('ends at tzeit on Saturday night', () => {
    const tzeit = getZmanim('2026-11-28', jerusalem).tzeit!;
    expect(getRestWindow(new Date(tzeit.getTime() - 60_000), jerusalem).active).toBe(true);
    expect(getRestWindow(new Date(tzeit.getTime() + 60_000), jerusalem).active).toBe(false);
    expect(recentRestDays(new Date(tzeit.getTime() + 60_000), jerusalem)).toEqual(['2026-11-28']);
  });

  it('spans a two-day Yom Tov in the diaspora', () => {
    // Shavuot 2027 in the diaspora: 11–12 June (Fri–Sat).
    const w = getRestWindow(new Date('2027-06-11T16:00:00Z'), ny);
    expect(w.active).toBe(true);
    expect(w.dateKeys).toEqual(['2027-06-11', '2027-06-12']);
  });
});

describe('upcoming holidays', () => {
  it('lists Chanukah once', () => {
    const list = upcomingHolidays('2026-11-23', true, 30);
    expect(list.filter((h) => h.desc.startsWith('Chanukah')).length).toBe(1);
  });
});

describe('holiday guides', () => {
  it('matches the right events in a leap year', async () => {
    const { guideForDesc } = await import('../data/holidays');
    expect(guideForDesc('Purim Katan')).toBeUndefined();
    expect(guideForDesc('Purim')?.key).toBe('purim');
    expect(guideForDesc('Rosh Hashana LaBehemot')).toBeUndefined();
    expect(guideForDesc('Rosh Hashana 5788')?.key).toBe('roshHashana');
    expect(guideForDesc('Yom Kippur Katan')).toBeUndefined();
    const list = upcomingHolidays('2026-11-23', true, 365).filter((h) => guideForDesc(h.desc)?.key === 'purim');
    expect(list[0]?.hebrewDate).toContain('אדר ב׳');
  });
});
