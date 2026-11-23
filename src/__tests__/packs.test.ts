import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import siddur from '../content/packs/siddur-sefard.json';
import tehillim from '../content/packs/tehillim.json';
import { ALLOWED_LICENSES, MONTHLY_TEHILLIM, SiddurPack, TehillimPack, tehillimForDay } from '../content/packs';
import { getDayInfo } from '../lib/jewishCalendar';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const S = siddur as SiddurPack;
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
    for (const p of S.prayers) {
      expect(p.sections.length).toBeGreaterThan(0);
      for (const s of p.sections) {
        expect(ALLOWED_LICENSES).toContain(s.license);
        expect(s.versionTitle).toBeTruthy();
        expect(s.versionSource).toMatch(/^https?:\/\//);
        expect(sha(s.segments.map((x) => x.text).join('\n'))).toBe(s.sha256);
        expect(s.segments.every((x) => !/<[a-z]/i.test(x.text))).toBe(true);
      }
    }
  });

  it('contains the weekday prayers and the blessings the app links to', () => {
    const ids = S.prayers.map((p) => p.id);
    for (const id of ['shacharit', 'mincha', 'maariv', 'birkat-hamazon', 'meein-shalosh', 'borei-nefashot', 'bedtime-shema']) expect(ids).toContain(id);
    const amidah = S.prayers.find((p) => p.id === 'shacharit')!.sections.find((s) => s.heTitle === 'עמידה')!;
    expect(amidah.segments[0]!.text.replace(/[\u0591-\u05C7]/g, '')).toContain('אדני שפתי תפתח');
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
