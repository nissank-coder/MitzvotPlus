import { describe, expect, it } from 'vitest';
import { addDays, hebrewNumeral, weekKeys, weekStartKey } from '../lib/dates';
import { bestStreak, currentStreak, levelInfo, weekBreakdown } from '../lib/progress';
import { ActivityLog } from '../types';

// 2026-11-23 is a Monday; 2026-11-21 is Shabbat.
const MON = '2026-11-23';

describe('dates', () => {
  it('starts the week on Sunday', () => {
    expect(weekStartKey(MON)).toBe('2026-11-22');
    expect(weekKeys(MON)).toHaveLength(7);
    expect(weekKeys(MON)[6]).toBe('2026-11-28');
  });

  it('adds days across month boundaries', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('writes Hebrew numerals', () => {
    expect(hebrewNumeral(787)).toBe('תשפ״ז');
    expect(hebrewNumeral(785)).toBe('תשפ״ה');
    expect(hebrewNumeral(15)).toBe('ט״ו');
    expect(hebrewNumeral(5)).toBe('ה׳');
  });
});

describe('streaks', () => {
  it('counts consecutive days ending today', () => {
    expect(currentStreak(new Set(['2026-11-23', '2026-11-22']), MON)).toBe(2);
  });

  it('does not break before the day is over', () => {
    expect(currentStreak(new Set(['2026-11-22']), MON)).toBe(1);
  });

  it('breaks after a missed weekday', () => {
    expect(currentStreak(new Set(['2026-11-23', '2026-11-19']), MON)).toBe(1);
  });

  it('does not break on Shabbat', () => {
    // Fri 20, (Shabbat 21 empty), Sun 22, Mon 23
    expect(currentStreak(new Set(['2026-11-20', '2026-11-22', '2026-11-23']), MON)).toBe(3);
    expect(bestStreak(new Set(['2026-11-20', '2026-11-22', '2026-11-23']))).toBe(3);
  });

  it('finds the best streak in history', () => {
    expect(bestStreak(new Set(['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-10']))).toBe(3);
    expect(bestStreak(new Set())).toBe(0);
  });
});

describe('levels', () => {
  it('computes level and distance to next', () => {
    expect(levelInfo(0)).toMatchObject({ level: 1, toNext: 500 });
    expect(levelInfo(500)).toMatchObject({ level: 2, toNext: 1000, progress: 0 });
    expect(levelInfo(1000).progress).toBeCloseTo(0.5);
    expect(levelInfo(1_000_000)).toMatchObject({ level: 10, isMax: true, toNext: 0 });
  });
});

describe('week breakdown', () => {
  const log = (dateKey: string, points = 10): ActivityLog => ({
    id: Math.random().toString(),
    title: 't',
    icon: 'heart',
    points,
    createdAt: 0,
    dateKey,
    kind: 'mitzvah',
  });

  it('only counts the current week', () => {
    const result = weekBreakdown([log('2026-11-21'), log('2026-11-22'), log(MON), log(MON, 5)], MON);
    expect(result.total).toBe(3);
    expect(result.points).toBe(25);
    expect(result.days[1]).toMatchObject({ count: 2, isToday: true });
    expect(result.days[2]?.isFuture).toBe(true);
  });
});
