import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import siddurIndex from '../content/packs/siddur-sefard-index.json';
import weekday from '../content/packs/siddur-sefard-weekday.json';
import shabbat from '../content/packs/siddur-sefard-shabbat.json';
import holiday from '../content/packs/siddur-sefard-holiday.json';
import tehillim from '../content/packs/tehillim.json';
import { ALLOWED_LICENSES, MONTHLY_TEHILLIM, SiddurIndex, SiddurPack, TehillimPack, tehillimForDay, SiddurTextSection } from '../content/packs';
import { getDayInfo } from '../lib/jewishCalendar';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const GROUPS = [weekday, shabbat, holiday] as SiddurPack[];
const ALL = GROUPS.flatMap((g) => g.prayers);
const INDEX = siddurIndex as SiddurIndex;
const T = tehillim as TehillimPack;

describe('Tehillim pack', () => {
  it('has all 150 chapters and 2,527 verses, unchanged since download', () => {
    expect(T.chapters).toHaveLength(150);
    expect(T.chapters.map((c) => c.chapter)).toEqual(Array.from({ length: 150 }, (_, i) => i + 1));
    expect(T.chapters.reduce((n, c) => n + c.verses.length, 0)).toBe(2527);
    expect(T.chapters[118]!.verses).toHaveLength(176);
    expect(sha(T.chapters.map((c) => c.verses.join('\n')).join('\n'))).toBe(T.sha256);
  });

  it('records an allowed license and source', () => {
    expect(ALLOWED_LICENSES).toContain(T.source.license);
    expect(T.source.versionTitle).toBe('Tanach with Nikkud');
    expect(T.approval).toBe('PENDING_RABBINIC_REVIEW');
  });
});

describe('Siddur Sefard pack', () => {
  it('every section has an allowed license, a source and an intact hash', () => {
    for (const p of ALL) {
      expect(p.sections.length).toBeGreaterThan(0);
      for (const s of p.sections) {
        if (s.missing) throw new Error(`a missing section in the Sefard pack: ${s.ref}`);
        expect(ALLOWED_LICENSES).toContain(s.license);
        expect(s.versionTitle).toBeTruthy();
        expect(s.versionSource).toMatch(/^https?:\/\//);
        expect(sha(s.segments.map((x) => x.text).join('\n'))).toBe(s.sha256);
        expect(s.segments.every((x) => !/<[a-z]/i.test(x.text))).toBe(true);
      }
    }
  });

  it('contains the weekday prayers and the blessings the app links to', () => {
    const ids = ALL.map((p) => p.id);
    for (const id of ['shacharit', 'mincha', 'maariv', 'birkat-hamazon', 'meein-shalosh', 'borei-nefashot', 'bedtime-shema']) expect(ids).toContain(id);
    const amidah = ALL.find((p) => p.id === 'shacharit')!.sections.find((s) => s.heTitle === 'עמידה') as SiddurTextSection;
    expect(amidah.segments[0]!.text.replace(/[\u0591-\u05C7]/g, '')).toContain('אדני שפתי תפתח');
  });
});

describe('Siddur Sefard – Shabbat and holidays', () => {
  it('the index lists exactly the prayers in the group files, each in its group', () => {
    expect(INDEX.prayers.map((p) => p.id)).toEqual(ALL.map((p) => p.id));
    for (const g of GROUPS) for (const p of g.prayers) expect(p.group).toBe((g as SiddurPack & { group: string }).group);
    expect(new Set(ALL.map((p) => p.id)).size).toBe(ALL.length);
  });

  it('contains the Shabbat prayers from Kabbalat Shabbat to Havdalah', () => {
    const ids = (shabbat as SiddurPack).prayers.map((p) => p.id);
    for (const id of ['shabbat-candles', 'kabbalat-shabbat', 'shabbat-maariv', 'shabbat-night-meal', 'shabbat-shacharit', 'shabbat-musaf', 'shabbat-mincha', 'havdalah']) expect(ids).toContain(id);
    const kiddush = (shabbat as SiddurPack).prayers.find((p) => p.id === 'shabbat-night-meal')!.sections.find((s) => s.heTitle.includes('קידוש')) as SiddurTextSection;
    expect(kiddush.segments.map((x) => x.text).join(' ').replace(/[\u0591-\u05C7]/g, '')).toContain('ויכלו');
  });

  it('contains Rosh Chodesh, festivals, Chanukah, Purim and the Haggadah', () => {
    const ids = (holiday as SiddurPack).prayers.map((p) => p.id);
    for (const id of ['rosh-chodesh', 'yom-tov', 'hoshanot', 'chanukah', 'purim', 'chametz', 'haggadah']) expect(ids).toContain(id);
    expect((holiday as SiddurPack).prayers.find((p) => p.id === 'haggadah')!.sections).toHaveLength(14);
  });
});

describe('monthly Tehillim division', () => {
  it('covers every chapter exactly once (Psalm 119 split by verses)', () => {
    const seen = new Map<number, number>();
    for (const day of MONTHLY_TEHILLIM) for (const r of day) for (let c = r.from; c <= r.to; c += 1) seen.set(c, (seen.get(c) ?? 0) + (r.verses ? (r.verses[1] - r.verses[0] + 1) / 176 : 1));
    expect(seen.size).toBe(150);
    expect([...seen.values()].every((v) => Math.abs(v - 1) < 1e-9)).toBe(true);
  });

  it('matches the hebcal daily schedule on a sample day and handles 29-day months', () => {
    // 13 Kislev 5787 → 69–71 (as hebcal's "Psalms ס״ט-ע״א").
    const info = getDayInfo('2026-11-23', true);
    expect(info.hebrewDay).toBe(13);
    expect(tehillimForDay(13, info.hebrewMonthLength)).toEqual([{ from: 69, to: 71 }]);
    expect(tehillimForDay(29, 29).map((r) => r.from)).toEqual([140, 145]);
    expect(tehillimForDay(29, 30)).toEqual([{ from: 140, to: 144 }]);
  });
});

/**
 * Round 14.1 – nusach Ashkenaz (internal review only): each prayer from ONE edition, so it reads as one
 * nusach; a section no allowed edition has is kept in its place as "missing" (the siddur says so),
 * never skipped and never filled from another nusach; the pack is not approved for distribution.
 */
describe('Siddur Ashkenaz pack (internal review)', async () => {
  const fs = await import('node:fs');
  const read = (g: string) => JSON.parse(fs.readFileSync(`src/content/packs/siddur-ashkenaz-${g}.json`, 'utf8')) as SiddurPack & { distribution: string; approval: string };
  const groups = ['weekday', 'shabbat', 'holiday'].map(read);
  const prayers = groups.flatMap((g) => g.prayers);

  it('is pending review and not approved for distribution', () => {
    for (const g of groups) expect([g.approval, g.distribution]).toEqual(['PENDING_RABBINIC_REVIEW', 'NOT_APPROVED']);
  });

  it('every prayer comes from one edition, with an allowed licence and intact text', () => {
    for (const p of prayers) {
      const present = p.sections.flatMap((s) => (s.missing ? [] : [s]));
      expect(present.length).toBeGreaterThan(0);
      expect(new Set(present.map((s) => s.versionTitle)).size).toBe(1);
      for (const s of present) {
        expect(ALLOWED_LICENSES).toContain(s.license);
        expect(sha(s.segments.map((x) => x.text).join('\n'))).toBe(s.sha256);
      }
    }
  });

  it('the weekday prayers are whole except three sections, each kept in its place and named', () => {
    const weekday = groups[0]!.prayers;
    const missing = weekday.flatMap((p) => p.sections.filter((s) => s.missing).map((s) => `${p.id}: ${s.heTitle}`));
    expect(missing).toEqual(['shacharit: יהי רצון', 'mincha: וידוי וי"ג המידות', 'maariv: ויתן לך']);
    expect(prayers.flatMap((p) => p.sections.filter((s) => s.missing)).length).toBe(7);
  });
});
