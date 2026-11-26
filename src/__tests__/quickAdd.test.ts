import { describe, expect, it } from 'vitest';
import { actionDef, categoryStyle } from '../data/actions';
import { quickAddGroups } from '../lib/quickAdd';

/**
 * Design round 1 – regression: the add sheet showed five tiles named "תפילה" and two named
 * "ברכות" (the category style's title overrode the action's own title).
 */
describe('add sheet: exact action names', () => {
  const groups = quickAddGroups('male');
  const items = groups.flatMap((g) => g.items);

  it('every item carries the action\'s own name', () => {
    for (const i of items) expect(i.title).toBe(actionDef(i.key).title);
  });
  it('the prayers appear by name – שחרית, מנחה, ערבית – not as "תפילה"', () => {
    const prayer = groups.find((g) => g.category === 'prayer')!;
    expect(prayer.title).toBe('תפילה');
    expect(prayer.items.map((i) => i.title)).toEqual(expect.arrayContaining(['שחרית', 'מנחה', 'ערבית', 'הנחת תפילין', 'אמירת תהילים']));
    const categoryTitles = new Set(Object.values(categoryStyle).map((c) => c.title));
    expect(items.filter((i) => categoryTitles.has(i.title))).toEqual([]);
  });
  it('no two items share a name', () => {
    expect(new Set(items.map((i) => i.title)).size).toBe(items.length);
  });
  it('only prayers with a minyan bonus ask for a detail; a single blessing is recorded at once', () => {
    expect(items.filter((i) => i.detail === 'minyan').map((i) => i.key).sort()).toEqual(['arvit', 'mincha', 'shacharit']);
    expect(items.find((i) => i.key === 'blessing')).toMatchObject({ title: 'ברכה', detail: null });
  });
  it('men-only actions are not offered to women', () => {
    expect(quickAddGroups('female').flatMap((g) => g.items).some((i) => i.key === 'tefillin')).toBe(false);
  });
});
