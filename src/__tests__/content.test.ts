import { describe, expect, it } from 'vitest';
import { CONTENT, ContentItem, dvarTorahFor } from '../content/registry';
import { newCreateItem } from '../sync/outbox';
import { createFreshState, reducer } from '../store/state';

const approved = (id: string): ContentItem => ({
  id, version: '1', kind: 'dvar-torah', language: 'he', title: 't', body: 'b',
  source: { title: 'מקור' }, license: { id: 'CC-BY-4.0' }, approval: 'APPROVED',
});

describe('content registry', () => {
  it('no bundled test item claims a source', () => {
    for (const c of CONTENT.filter((x) => x.approval === 'TEST_ONLY')) {
      expect(c.source).toBeNull();
      expect(c.license.id).toMatch(/^TEST-ONLY/);
    }
  });

  it('uses the schedule: approved items by date, stable', () => {
    const items = [...CONTENT, approved('a'), approved('b')];
    const schedule = { '2026-11-24': items[items.length - 2]!.id, '2026-11-25': items[items.length - 1]!.id };
    const pick = dvarTorahFor('2026-11-24', items, schedule)!;
    expect(pick.approval).toBe('APPROVED');
    expect(dvarTorahFor('2026-11-24', items, schedule)).toBe(pick);
    expect(dvarTorahFor('2026-11-25', items, schedule)!.id).not.toBe(pick.id);
  });

  it('falls back to test items only when nothing is approved', () => {
    expect(dvarTorahFor('2026-11-24')!.approval).toBe('TEST_ONLY');
    expect(dvarTorahFor('2026-11-24', [])).toBeNull();
  });

  it('completion records the content id and version; the same item once per day, points once per day', () => {
    const now = Date.UTC(2026, 10, 24, 10);
    let s = reducer(createFreshState(now), { type: 'addAction', payload: { key: 'dailyTorah', now, content: { id: 'a', version: '1' } } });
    s = reducer(s, { type: 'addAction', payload: { key: 'dailyTorah', now: now + 1, content: { id: 'a', version: '1' } } });
    expect(s.logs).toHaveLength(1);
    s = reducer(s, { type: 'addAction', payload: { key: 'dailyTorah', now: now + 2, content: { id: 'b', version: '1' } } });
    expect(s.logs).toHaveLength(2);
    expect(s.logs.map((l) => l.points)).toEqual([0, 10]);
    s = { ...s, logs: s.logs.slice(1) };
    expect(s.logs[0]!.content).toEqual({ id: 'a', version: '1' });
    expect(JSON.parse(newCreateItem(s.logs[0]!, 'i', now).payload)).toMatchObject({ contentId: 'a', contentVersion: '1' });
  });
});
