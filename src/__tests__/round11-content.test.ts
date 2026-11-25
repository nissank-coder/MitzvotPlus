import { describe, expect, it } from 'vitest';
import * as registry from '../content/registry';
import type { ContentItem } from '../content/registry';

/** Round 11 §4 – stable Dvar Torah per date. */
const item = (id: string): ContentItem => ({
  id, version: '1', kind: 'dvar-torah', language: 'he', title: id, body: 'גוף הטקסט של דבר התורה, ארוך מספיק.',
  source: { title: 'מקור' }, license: { id: 'Public Domain' }, approval: 'APPROVED', review: { reviewer: 'r', reviewedAt: '2026-11-24' },
});
const forDate = registry.weeklyFor as unknown as (d: string, items?: ContentItem[], schedule?: Record<string, string>) => ContentItem | null;

describe('§4 stable assignment by date', () => {
  it('adding items does not change the item of a day that already has one', () => {
    const schedule = { '2026-11-24': 'dvar-torah/a', '2026-11-25': 'dvar-torah/b' };
    const two = [item('dvar-torah/a'), item('dvar-torah/b')];
    const before = forDate('2026-11-25', two, schedule)?.id;
    const three = [...two, item('dvar-torah/c')];
    expect(forDate('2026-11-25', three, { ...schedule, '2026-11-26': 'dvar-torah/c' })?.id).toBe(before);
    expect(before).toBe('dvar-torah/b');
  });
  it('weekly: a day without its own entry shows the latest scheduled item of the week, else nothing', () => {
    const schedule = { '2026-11-20': 'dvar-torah/a' };
    expect(forDate('2026-11-24', [item('dvar-torah/a')], schedule)?.id).toBe('dvar-torah/a');
    expect(forDate('2026-12-10', [item('dvar-torah/a')], schedule)).toBeNull();
  });
  it('a schedule entry for an unknown or unapproved item shows nothing (never a draft)', () => {
    const draft = { ...item('dvar-torah/d'), approval: 'TEST_ONLY' as const };
    expect(forDate('2026-11-24', [draft], { '2026-11-24': 'dvar-torah/d' })).toBeNull();
    expect(forDate('2026-11-24', [], { '2026-11-24': 'dvar-torah/x' })).toBeNull();
  });
});

describe('round 12: daily and weekly are separate', () => {
  it('the daily item is for its exact date only; the weekly one covers the week', () => {
    const daily = { '2026-12-01': 'dvar-torah/d1' };
    const weekly = { '2026-11-28': 'dvar-torah/w1' };
    const items = [item('dvar-torah/d1'), item('dvar-torah/w1')];
    expect(registry.dvarTorahFor('2026-12-01', items, daily)?.id).toBe('dvar-torah/d1');
    expect(registry.dvarTorahFor('2026-12-02', items, daily)).toBeNull();
    expect(registry.weeklyFor('2026-12-02', items, weekly)?.id).toBe('dvar-torah/w1');
    expect(registry.weeklyFor('2026-12-05', items, weekly)).toBeNull(); // next Shabbat needs its own item
  });
});
