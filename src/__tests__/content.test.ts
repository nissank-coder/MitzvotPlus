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

  it('prefers approved items and is stable for a date', () => {
    const items = [...CONTENT, approved('a'), approved('b')];
    const pick = dvarTorahFor('2026-11-24', items)!;
    expect(pick.approval).toBe('APPROVED');
    expect(dvarTorahFor('2026-11-24', items)).toBe(pick);
    expect(dvarTorahFor('2026-11-25', items)!.id).not.toBe(pick.id);
  });

  it('falls back to test items only when nothing is approved', () => {
    expect(dvarTorahFor('2026-11-24')!.approval).toBe('TEST_ONLY');
    expect(dvarTorahFor('2026-11-24', [])).toBeNull();
  });

  it('completion records the content id and version, still once per day', () => {
    const now = Date.UTC(2026, 10, 24, 10);
    let s = reducer(createFreshState(now), { type: 'addAction', payload: { key: 'dailyTorah', now, content: { id: 'a', version: '1' } } });
    s = reducer(s, { type: 'addAction', payload: { key: 'dailyTorah', now: now + 1, content: { id: 'b', version: '1' } } });
    expect(s.logs).toHaveLength(1);
    expect(s.logs[0]!.content).toEqual({ id: 'a', version: '1' });
    expect(JSON.parse(newCreateItem(s.logs[0]!, 'i', now).payload)).toMatchObject({ contentId: 'a', contentVersion: '1' });
  });
});
